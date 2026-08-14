import { defineAgentTool, type SpecializedAgentRunCtx } from '@seta/agent-sdk';
import { buildLinkApprovalCard } from './approval-card.ts';
import type { ActionPorts } from './ports.ts';
import { resolveTwoEndpoints } from './resolve-endpoints.ts';
import type { ActionOpenPreview } from './schemas.ts';
import {
  LinkTasksResumeSchema,
  LinkTasksSuspendSchema,
  LinkTasksToolInputSchema,
  LinkTasksToolOutputSchema,
} from './schemas.ts';

export interface LinkTasksToolDeps {
  ports: ActionPorts;
  ctx: SpecializedAgentRunCtx;
  /** The preview the SERVER found open for this turn, or null (FUT-840). It
   *  arrives through the run context and never through tool arguments, which is
   *  what lets this tool verify the model's `revisionOf` against it (design D15). */
  openPreview?: ActionOpenPreview | null;
}

/** How to say a kind in a refusal, matching the phrasing the task detail page
 *  uses for the same row (design §3.1). */
const KIND_PHRASE: Record<'relates' | 'duplicates' | 'blocks', string> = {
  relates: 'related',
  duplicates: 'duplicates of each other',
  blocks: 'blocking each other',
};

/**
 * A2's link tool: preview → confirm → gated write of ONE typed `task_references` row.
 *
 * Kept separate from `planner_mergeTasks` rather than folded into one tool with
 * a `mode` (design D6): merge trashes a task, so a single wrong enum value would
 * turn "link these two" into "trash one of these". They share
 * `resolveTwoEndpoints`, not a parameter.
 */
export function makeLinkTasksTool(deps: LinkTasksToolDeps) {
  const { ports, ctx } = deps;
  const actor = { tenantId: ctx.tenantId, actorUserId: ctx.actorUserId };

  return defineAgentTool({
    id: 'planner_linkTasks',
    name: 'Link Tasks',
    description: [
      'Chat flow only — shows the user a preview card and waits for them to confirm.',
      '',
      'Record a relationship between TWO tasks the user has already identified.',
      '',
      'Use for: "link task Alpha with task Beta"; "task này liên quan tới task kia";',
      '"mark this one as blocking the deploy".',
      'Do NOT use to merge two tasks — that is planner_mergeTasks, which also sends the',
      'duplicate to trash. This tool deletes nothing.',
      '',
      'kind is directional for duplicates and blocks: the SOURCE task is the duplicate,',
      'or the blocker. When the user just says "related", use relates.',
    ].join('\n'),
    input: LinkTasksToolInputSchema,
    output: LinkTasksToolOutputSchema,
    suspendSchema: LinkTasksSuspendSchema,
    resumeSchema: LinkTasksResumeSchema,
    // Declarative metadata only; the first pass gates for itself, on BOTH groups.
    rbac: 'planner.task.update',
    execute: async ({ sourceTaskRef, targetTaskRef, kind }, toolCtx) => {
      const agent = toolCtx.agent;
      const resume = agent?.resumeData;

      // ── Resume pass ────────────────────────────────────────────────────────
      if (resume) {
        const decision = LinkTasksResumeSchema.parse(resume);
        if (decision.action === 'decline') {
          return { linked: false, linkId: null, refusal: null };
        }
        if (!decision.idempotencyKey) {
          return {
            linked: false,
            linkId: null,
            refusal: 'This preview is incomplete. Ask me for the link again.',
          };
        }
        const result = await ports.taskLink.link({
          ...actor,
          sourceTaskId: decision.sourceTaskId,
          targetTaskId: decision.targetTaskId,
          kind: decision.kind,
          idempotencyKey: decision.idempotencyKey,
        });
        return { linked: true, linkId: result.linkId, refusal: null };
      }

      // ── First pass ─────────────────────────────────────────────────────────
      const resolved = await resolveTwoEndpoints({
        port: ports.taskLink,
        actor,
        toolCtx,
        sourceRef: sourceTaskRef,
        targetRef: targetTaskRef,
      });
      if (!resolved.ok) {
        return { linked: false, linkId: null, refusal: resolved.refusal };
      }

      // BEFORE the card, so an existing relationship is an answer rather than a
      // card that fails when the user presses Confirm.
      const pair = await ports.taskLink.readPairLink({
        ...actor,
        sourceTaskId: resolved.source.taskId,
        targetTaskId: resolved.target.taskId,
      });
      if (pair) {
        const both = `"${resolved.source.title}" and "${resolved.target.title}"`;
        const refusal =
          pair.kind !== kind
            ? `${both} are already marked as ${KIND_PHRASE[pair.kind]}. Remove that relationship first if you want a different one.`
            : pair.direction === 'outgoing'
              ? `${both} are already linked that way.`
              : `${both} are already linked that way, in the other direction.`;
        return { linked: false, linkId: null, refusal };
      }

      const card = buildLinkApprovalCard({
        source: resolved.source,
        target: resolved.target,
        kind,
        tenantId: ctx.tenantId,
        userId: ctx.actorUserId,
        // Minted HERE and persisted on the card: resume may run in another
        // process, so the key can only travel via proposed_payload.
        idempotencyKey: crypto.randomUUID(),
      });

      if (typeof agent?.suspend !== 'function') {
        throw new Error('planner_linkTasks: ctx.agent.suspend unavailable');
      }
      await agent.suspend({ card });
      return { linked: false, linkId: null };
    },
  });
}
