import type { ChatHitlDecider, ChatHitlDeciderOpts } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { assignTask } from '../domain/assign-task.ts';
import { getTask } from '../domain/get-task.ts';
import {
  type AssignDecisionInput,
  applyAssignDecision,
} from '../workflows/assign-by-skill/workflow.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Chat-flow HITL decider for planner_proposeAssignment.
//
// When the user clicks Approve / Reject / Modify on the in-thread approval card
// produced by proposeAssignment, the decide-approval endpoint calls this
// function instead of resuming a Mastra workflow (there is no workflow run to
// resume in the chat flow — see sdks/agent/src/hitl/chat-hitl.ts for details).
//
// This is registered under key 'planner_proposeAssignment' in
// AgentRouteDeps.chatHitlDeciders by packages/agent/src/register.ts
// (the only layer allowed to import from both the agent engine and planner).
// ─────────────────────────────────────────────────────────────────────────────

interface ApprovalCardLike {
  primary?: { argsPatch?: Record<string, unknown> };
  alternates?: ReadonlyArray<{ argsPatch?: Record<string, unknown> }>;
  decline?: { argsPatch?: Record<string, unknown> };
}

/**
 * Translate an approve/reject/modify decision into an AssignDecisionInput by
 * reading argsPatch fields from the stored ApprovalCard. Mirrors the logic in
 * decide-approval.ts#resumeDataFromDecision for consistency.
 */
function decisionFromCard(
  card: ApprovalCardLike,
  decision: 'approve' | 'reject' | 'modify',
  overrideUserIds: string[] | undefined,
): AssignDecisionInput {
  if (decision === 'reject') {
    return { action: 'decline' };
  }
  if (decision === 'approve') {
    const patch = card.primary?.argsPatch as
      | { action?: string; assigneeUserIds?: string[] }
      | undefined;
    if (patch?.action === 'assign' && Array.isArray(patch.assigneeUserIds)) {
      return { action: 'assign', assigneeUserIds: patch.assigneeUserIds };
    }
    return { action: 'leave-unassigned' };
  }
  // modify: user supplied a custom assignee set
  if (overrideUserIds && overrideUserIds.length > 0) {
    return { action: 'assign', assigneeUserIds: overrideUserIds };
  }
  return { action: 'leave-unassigned' };
}

/**
 * Reads the taskId from an ApprovalCard. We embed it in primary.argsPatch
 * via the `taskId` field set by buildCard in propose-assignment.ts.
 */
function taskIdFromCard(card: ApprovalCardLike): string | null {
  const patch = card.primary?.argsPatch as { taskId?: unknown } | undefined;
  return typeof patch?.taskId === 'string' ? patch.taskId : null;
}

export const plannerProposeAssignmentChatHitlDecider: ChatHitlDecider = async (
  opts: ChatHitlDeciderOpts,
) => {
  const card = (opts.proposedPayload ?? null) as ApprovalCardLike | null;
  if (!card) return;

  const taskId = taskIdFromCard(card);
  if (!taskId) return;

  const session = await buildActorSession({ user_id: opts.session.user_id });

  const assignDecision = decisionFromCard(card, opts.decision, opts.overrideUserIds);
  if (assignDecision.action === 'assign') {
    const current = await getTask({ task_id: taskId, session });
    const currentAssigneeIds = current.assignees.map((a) => a.user_id);
    const requested = new Set(assignDecision.assigneeUserIds);

    // Skip drift guard when user explicitly approved the card's primary or
    // alternate selection. The card was built from live data at proposal time
    // and the user is confirming that exact suggestion — requiring an exact
    // match with current state causes false positives when the task was
    // reassigned between proposal and approval (which is already handled by
    // the supersede subscriber). Only block if the task has been assigned to
    // *exactly* the same set (true no-op).
    const alreadyAssigned =
      currentAssigneeIds.length > 0 &&
      currentAssigneeIds.length === requested.size &&
      currentAssigneeIds.every((id) => requested.has(id));
    if (alreadyAssigned) return; // superseded — nothing to do
  }

  await applyAssignDecision({ taskId, decision: assignDecision, session }, { assignTask });
};
