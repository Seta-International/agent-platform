import { findOpenPreviewsForTasks, loadChatPreviewById } from '@seta/agent';
import type { ApprovalCard } from '@seta/agent-sdk';
import type { LoadedPreview, PreviewPort } from '@seta/planner/orchestration';

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
