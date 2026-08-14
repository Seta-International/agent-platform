import { findOpenChatPreview, findOpenPreviewsForTasks, loadChatPreviewById } from '@seta/agent';
import type { ApprovalCard } from '@seta/agent-sdk';
import type { ActionOpenPreview, LoadedPreview, PreviewPort } from '@seta/planner/orchestration';

/** The one runtime whose cards A2 may revise. The recommend runtime's cards are
 *  authored by planner.assignment-orchestrator and are deliberately out of scope
 *  (design D2): re-running the recommend pipeline on every adjustment is slow and
 *  expensive, and the agent choosing the person is a new request, not an
 *  adjustment. */
const REVISABLE_WORKFLOW_IDS = ['planner.action'] as const;

/**
 * A2's `ActionPorts.preview`, composed here because apps/server is the only layer
 * that sees both `@seta/planner` and `@seta/agent`. Planner declares the
 * interface; the SQL stays in the agent tier.
 *
 * The agent-tier lookups take a `PreviewScope` — just `{ tenant_id, user_id }` —
 * precisely so this adapter can satisfy them from an actor pair without
 * fabricating a permission set. They perform no permission check of their own:
 * the tenant + approver predicates ARE the authorization, and the actor is only
 * ever reading their own pending proposal.
 */
export function makeActionPreviewPort(): PreviewPort {
  return {
    async loadPreview({ tenantId, actorUserId, approvalId }): Promise<LoadedPreview | null> {
      const found = await loadChatPreviewById({
        session: { tenant_id: tenantId, user_id: actorUserId },
        approvalId,
        workflowIds: REVISABLE_WORKFLOW_IDS,
      });
      if (!found) return null;
      const card: ApprovalCard = found.card;
      return {
        approvalId: found.approvalId,
        toolId: card.meta.toolId,
        argsPatch: card.primary.argsPatch ?? {},
      };
    },

    async takenDedupKeys({ tenantId, dedupKeys }): Promise<string[]> {
      return findOpenPreviewsForTasks({
        // No user scope: the task: mutex is per TENANT, matching the assign
        // mutex (design D18). user_id is unread by this lookup; the empty string
        // documents that rather than implying a real actor.
        session: { tenant_id: tenantId, user_id: '' },
        dedupKeys,
      });
    },
  };
}

/** The `kvTable` rows the card renders, which are already human: names resolved,
 *  priority as WORDS, dates formatted. Reused verbatim for the prompt rather than
 *  re-rendered from `argsPatch`, so the model reads exactly what the user is
 *  looking at — with no second formatter and no name lookup. */
function proposedRowsFromCard(card: ApprovalCard): Array<{ k: string; v: string }> {
  for (const block of card.details ?? []) {
    if (block.kind === 'kvTable') return block.rows;
  }
  return [];
}

/**
 * The chat router's open-preview lookup, bound to the one revisable runtime.
 *
 * Returns only what the prompt and design D15 need: the approval id the tool
 * compares the model's `revisionOf` against, the tool that owns the card, the
 * card's own intent line (which names the task, for design D19), and the rows the
 * user can see. The machine-readable `argsPatch` is deliberately NOT forwarded —
 * Part 2's tools re-read the persisted card, so keeping the proposal out of the
 * prompt means no argsPatch value can be smuggled back in through model text.
 */
export function makeFindOpenPreview() {
  return async function findOpenPreview(args: {
    tenantId: string;
    actorUserId: string;
    threadId: string;
  }): Promise<ActionOpenPreview | null> {
    const found = await findOpenChatPreview({
      session: { tenant_id: args.tenantId, user_id: args.actorUserId },
      threadId: args.threadId,
      workflowIds: REVISABLE_WORKFLOW_IDS,
    });
    if (!found) return null;
    return {
      approvalId: found.approvalId,
      toolId: found.card.meta.toolId,
      intent: found.card.intent,
      proposedRows: proposedRowsFromCard(found.card),
    };
  };
}
