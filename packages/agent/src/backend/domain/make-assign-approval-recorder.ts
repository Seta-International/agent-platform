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
  return async (card): Promise<ChatHitlApprovalIds & { cardInThread: boolean }> => {
    const taskId = taskIdFromCard(card);
    if (taskId) {
      const existingRunId = await getPendingAssignRunIdForTask({ taskId, tenantId });
      if (existingRunId) {
        const existing = await pool.query<{
          approval_id: string;
          approver_user_id: string;
          surface_chat_thread_id: string | null;
        }>(
          `SELECT approval_id, approver_user_id, surface_chat_thread_id
             FROM agent.workflow_approvals
            WHERE run_id = $1 AND status = 'pending'
            ORDER BY created_at DESC LIMIT 1`,
          [existingRunId],
        );
        const row = existing.rows[0];
        if (row) {
          // The pending card follows its approver: when the same user re-asks
          // from a new thread, rebind the card there so "the approval card
          // above" stays true. Another approver's card is never moved (it
          // would become invisible to its approver) — the caller gets
          // cardInThread=false and must not point at an in-thread card.
          const sameApprover = row.approver_user_id === userId;
          if (sameApprover && threadId && row.surface_chat_thread_id !== threadId) {
            await pool.query(
              `UPDATE agent.workflow_approvals
                  SET surface_chat_thread_id = $2
                WHERE approval_id = $1 AND status = 'pending'`,
              [row.approval_id, threadId],
            );
          }
          return {
            runId: existingRunId,
            approvalId: row.approval_id,
            cardInThread: sameApprover && threadId != null,
          };
        }
        throw new PendingAssignmentExistsError(taskId);
      }
    }
    const ids = await insertChatHitlApproval({ card, tenantId, userId, threadId, pool });
    return { ...ids, cardInThread: threadId != null };
  };
}
