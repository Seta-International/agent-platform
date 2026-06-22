/**
 * Preview every ARIA card payload without the UI or a database.
 *
 * Runs the real `performance_renderCard` tool (RBAC + server-side assembly +
 * contract validation) against the in-memory mock data and prints the JSON the
 * frontend will ingest. This is the fastest way to eyeball the AI side.
 *
 *   pnpm -F @seta/performance exec tsx scripts/preview-cards.ts
 */
import { makeToolContext } from '@seta/agent-sdk/testing';
import { renderCardTool } from '../src/backend/agent-tools/render-card.ts';
import type { CardPayload } from '../src/backend/cards/schema.ts';

type Audience = 'hr' | 'leader' | 'bod';

function ctxFor(audience: Audience) {
  return makeToolContext({
    user_id: `u-${audience}`,
    permissions: ['performance.norm.read'],
    role_summary: { roles: [`performance.${audience}`], cross_tenant_read: false },
  });
}

async function render(
  label: string,
  audience: Audience,
  input: Record<string, unknown>,
): Promise<void> {
  const banner = `── ${label}  (audience: ${audience}) `;
  console.log(`\n${banner}${'─'.repeat(Math.max(0, 72 - banner.length))}`);
  try {
    const out = (await renderCardTool.execute!(input as never, ctxFor(audience))) as {
      card: CardPayload;
    };
    console.log(JSON.stringify(out.card, null, 2));
  } catch (err) {
    console.log(`(tool rejected) ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  console.log('ARIA card payloads — produced by performance_renderCard over mock data\n');

  // 1. Full employee profile report (HR).
  await render('employee_profile_report', 'hr', {
    card_type: 'employee_profile_report',
    member_id: 'EMP-031',
  });

  // 2. Compact inline transcript card (Leader).
  await render('inline_transcript', 'leader', {
    card_type: 'inline_transcript',
    member_id: 'EMP-031',
  });

  // 3. At-risk roster — Leader sees names.
  await render('at_risk_list (Leader — names shown)', 'leader', {
    card_type: 'at_risk_list',
    account_id: 'ACC-B',
    period: '2026-04',
  });

  // 4. Same roster for BOD — names redacted to ids (aggregate guardrail).
  await render('at_risk_list (BOD — names redacted)', 'bod', {
    card_type: 'at_risk_list',
    account_id: 'ACC-B',
    period: '2026-04',
  });

  // 5. Account-level workforce summary (BOD).
  await render('account_summary', 'bod', { card_type: 'account_summary' });

  // 6. RBAC guardrail — Leader asks for sensitive HR content → access denied.
  await render('access_denied (Leader requests sensitive HR content)', 'leader', {
    card_type: 'employee_profile_report',
    member_id: 'EMP-031',
    include_sensitive: true,
  });

  // 7. Sensitive conclusion held for human review.
  await render('human_review_flag', 'hr', {
    card_type: 'human_review_flag',
    conclusion:
      'EMP-031 is flagged for potential performance improvement plan (PIP) consideration based on the 3-month KPI trend.',
  });

  console.log('\nDone. Every payload above is validated against CardPayloadSchema.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
