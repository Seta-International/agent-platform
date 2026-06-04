import type { ApprovalCard, ChatHitlRecorder } from '@seta/agent-sdk';
import type { Pool } from 'pg';
import { getPendingAssignRunIdForTask } from './get-pending-assign-run-for-task.ts';
import { type ChatHitlApprovalIds, insertChatHitlApproval } from './insert-chat-hitl-approval.ts';

/** A pending proposal exists for the task but its approval row is not readable
 *  yet (an evented assignBySkill run that has not reached its suspend step).
 *  Callers fail-open on this — the recommendation is still answered; only the
 *  one-click card is skipped, instead of racing the in-flight workflow. */
export class PendingAssignmentExistsError extends Error {
  constructor(taskId: string) {
    super(`an assignment proposal is already in flight for task ${taskId}`);
  }
}

export interface MakeAssignApprovalRecorderOpts {
  tenantId: string;
  userId: string;
  /** Chat thread the card surfaces in — null outside a thread. */
  threadId: string | null;
  pool: Pool;
}

function taskIdFromCard(card: ApprovalCard): string | null {
  const taskId = card.primary.argsPatch?.taskId;
  return typeof taskId === 'string' ? taskId : null;
}

/**
 * ChatHitlRecorder for the inline-orchestration chat path, idempotent per task:
 * if the task already has a pending proposal (chat-HITL, supervisor
 * proposeAssignment, or evented assignBySkill), return the existing rows
 * instead of inserting a competing card. Mirrors the mutex the supervisor
 * path's planner_proposeAssignment tool performs before recording.
 */
export function makeAssignApprovalRecorder(opts: MakeAssignApprovalRecorderOpts): ChatHitlRecorder {
  const { tenantId, userId, threadId, pool } = opts;
  return async (card): Promise<ChatHitlApprovalIds> => {
    const taskId = taskIdFromCard(card);
    if (taskId) {
      const existingRunId = await getPendingAssignRunIdForTask({ taskId, tenantId });
      if (existingRunId) {
        const existing = await pool.query<{ approval_id: string }>(
          `SELECT approval_id FROM agent.workflow_approvals
            WHERE run_id = $1 AND status = 'pending'
            ORDER BY created_at DESC LIMIT 1`,
          [existingRunId],
        );
        const approvalId = existing.rows[0]?.approval_id;
        if (approvalId) return { runId: existingRunId, approvalId };
        throw new PendingAssignmentExistsError(taskId);
      }
    }
    return insertChatHitlApproval({ card, tenantId, userId, threadId, pool });
  };
}
