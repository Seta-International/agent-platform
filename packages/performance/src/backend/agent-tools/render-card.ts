import { defineAgentTool } from '@seta/agent-sdk';
import { z } from 'zod';
import {
  accountLabel,
  audienceRoleLabel,
  buildAccessDeniedCard,
  buildAccountSummaryCard,
  buildAtRiskListCard,
  buildEmployeeProfileCard,
  buildHumanReviewFlagCard,
  buildInlineTranscriptCard,
} from '../cards/build.ts';
import { CARD_TYPES, CardPayloadSchema } from '../cards/schema.ts';
import { assembleProfile } from '../domain/assemble.ts';
import { getDataAccess } from '../domain/data-access.ts';
import { evaluateNormRules } from '../domain/norm-engine/index.ts';
import { resolveSession } from './context.ts';

/**
 * Render a UI card. The agent calls this ONLY when an answer is better shown as
 * a structured card than as prose (see the ARIA instructions for when/which).
 *
 * The card's data is assembled server-side from the datasets + NORM engine —
 * never from values the model retyped — and the output is validated against the
 * card contract, so the shape the frontend ingests is guaranteed.
 *
 * RBAC: the audience is taken from the SESSION, never from input. A non-HR
 * caller requesting sensitive HR content (promotion readiness, salary band, HR
 * notes) gets an `access_denied` card instead of the data. The BOD aggregate
 * guardrail (no individual names in lists) is applied in the builder.
 */
export const renderCardTool = defineAgentTool({
  id: 'performance_renderCard',
  name: 'Render Card',
  description:
    'Render a performance UI card for the user. Use only when a card is the right ' +
    'medium (an employee profile, an at-risk roster, an account-level risk summary, ' +
    'or a sensitive conclusion needing human review) — not for ordinary prose answers. ' +
    'Card data is assembled server-side; you choose the card_type and the scope.',
  input: z.object({
    card_type: z.enum(CARD_TYPES).describe('Which card to render.'),
    member_id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Required for employee_profile_report and inline_transcript.'),
    account_id: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Optional scope for at_risk_list / account_summary, e.g. "ACC-B".'),
    period: z.string().trim().min(1).optional().describe('Optional period scope, e.g. "2026-04".'),
    include_sensitive: z
      .boolean()
      .default(false)
      .describe(
        'Set true only when the user explicitly asked for sensitive HR content ' +
          '(promotion readiness, salary band, HR notes). Gated to the HR audience.',
      ),
    conclusion: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Required for human_review_flag: the sensitive conclusion to hold for approval.'),
  }),
  output: z.object({ card: CardPayloadSchema }),
  rbac: 'performance.norm.read',
  execute: async (input, ctx) => {
    const { tenantId, audience } = resolveSession(ctx);

    // RBAC guardrail: sensitive HR content is HR-only. Any non-HR audience that
    // requests it gets an access-denied card rather than the data.
    if (input.include_sensitive && audience !== 'hr') {
      const roleWord = audience === 'leader' ? 'Leader' : 'BOD';
      return {
        card: buildAccessDeniedCard({
          message: `Your current role ${roleWord} does not have permission to view promotion readiness or sensitive HR notes.`,
          currentRole: audienceRoleLabel(audience),
          requiredRole: 'HR role required',
        }),
      };
    }

    const da = getDataAccess();

    switch (input.card_type) {
      case 'employee_profile_report':
      case 'inline_transcript': {
        if (!input.member_id) {
          throw new Error(`${input.card_type} requires member_id`);
        }
        const profile = await assembleProfile(tenantId, input.member_id, input.period);
        const norm = evaluateNormRules(profile);
        const card =
          input.card_type === 'employee_profile_report'
            ? buildEmployeeProfileCard(profile, norm)
            : buildInlineTranscriptCard(profile, norm);
        return { card: CardPayloadSchema.parse(card) };
      }

      case 'at_risk_list': {
        const entries = await da.listAtRiskEmployees(tenantId, {
          accountId: input.account_id,
          period: input.period,
        });
        const card = buildAtRiskListCard(
          entries,
          { accountLabel: accountLabel(input.account_id ?? null), period: input.period ?? null },
          audience,
        );
        return { card: CardPayloadSchema.parse(card) };
      }

      case 'account_summary': {
        const summary = await da.getAccountSummary(tenantId, {
          accountId: input.account_id,
          period: input.period,
        });
        return { card: CardPayloadSchema.parse(buildAccountSummaryCard(summary)) };
      }

      case 'human_review_flag': {
        if (!input.conclusion) {
          throw new Error('human_review_flag requires a conclusion');
        }
        return {
          card: CardPayloadSchema.parse(buildHumanReviewFlagCard({ conclusion: input.conclusion })),
        };
      }

      case 'access_denied': {
        return {
          card: buildAccessDeniedCard({
            message:
              'You do not have permission to view this information for the current audience.',
            currentRole: audienceRoleLabel(audience),
            requiredRole: 'HR role required',
          }),
        };
      }
    }
  },
});
