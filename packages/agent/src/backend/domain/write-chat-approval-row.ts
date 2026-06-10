import type { ApprovalCard } from '@seta/agent-sdk';
import type { Pool } from 'pg';
import { getPendingAssignRunIdForTask } from './get-pending-assign-run-for-task.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Read-model writer for the native-suspend chat HITL approval.
//
// WHY THIS EXISTS
// ───────────────
// The staffing orchestrator's proposeAssignment composite tool runs the
// recommend pipeline then calls `ctx.agent.suspend({ card })`. Mastra signals
// that suspension only via an in-process `tool-call-suspended` stream chunk —
// the global `workflow.suspend` pubsub event (which the evented lifecycle hook
// keys off) is NEVER emitted on the agent.stream() path. So the orchestration
// stream surfaces an `approval` OrchestrationEvent and this writer projects it
// into the agent.workflow_runs + agent.workflow_approvals read-model rows so
// the frontend's pending-approvals poll renders the card.
//
// This row carries:
//   • workflow_id = 'staffing.orchestrator' (the agentic run's logical id)
//   • mastra_run_id + tool_call_id — the agentic-resume parameters Task 7 uses
//     to `mastra.getAgent().resume()`. Their presence is the
//     agentic-vs-evented-workflow discriminator on the approval row.
//
// Idempotent per task: if a
// pending assignment proposal already exists for the task, the existing
// approval is returned (no competing card) and — for the same approver — the
// card follows them to a new thread.
// ─────────────────────────────────────────────────────────────────────────────

/** Logical id of the agentic orchestrator run that owns chat-HITL approvals. */
export const STAFFING_ORCHESTRATOR_WORKFLOW_ID = 'staffing.orchestrator';

export interface WriteChatApprovalRowOpts {
  card: ApprovalCard;
  /** Mastra run id of the suspended agentic run — the resume target (Task 7). */
  mastraRunId: string;
  /** Tool-call id of the suspended proposeAssignment call — the resume token. */
  toolCallId: string;
  tenantId: string;
  userId: string;
  /** The current chat thread ID from requestContext — null if not in a thread. */
  threadId: string | null;
  pool: Pool;
  /** Hours until the approval expires. Defaults to 72 (matching evented workflows). */
  approvalTtlHours?: number;
}

export interface WriteChatApprovalRowResult {
  runId: string;
  approvalId: string;
  /** True when the card surfaces in the caller's current thread (same approver,
   *  in a thread). False when reusing another approver's existing card. */
  cardInThread: boolean;
}

function taskIdFromCard(card: ApprovalCard): string | null {
  const taskId = card.primary.argsPatch?.taskId;
  return typeof taskId === 'string' ? taskId : null;
}

/**
 * Projects a native-suspend `approval` event into the workflow_runs +
 * workflow_approvals read-model rows. Idempotent per task. Returns the row ids
 * and whether the card lives in the caller's thread.
 */
export async function writeChatApprovalRow(
  opts: WriteChatApprovalRowOpts,
): Promise<WriteChatApprovalRowResult> {
  const {
    card,
    mastraRunId,
    toolCallId,
    tenantId,
    userId,
    threadId,
    pool,
    approvalTtlHours = 72,
  } = opts;

  // Mutex: if a pending assignment proposal already exists for this task —
  // chat-HITL, native-suspend, or an in-flight evented assignBySkill run —
  // reuse it instead of inserting a competing card.
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
        // above" stays true. Another approver's card is never moved.
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
      // A pending evented run exists but hasn't reached its suspend step, so
      // there is no approval row to reuse. Fail open: skip writing a competing
      // card rather than race the in-flight workflow.
      throw new PendingAssignmentExistsError(taskId);
    }
  }

  const expiresAt = new Date(Date.now() + approvalTtlHours * 60 * 60 * 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Synthetic agentic-run row — required by the FK on workflow_approvals.
    const runRes = await client.query<{ run_id: string }>(
      `INSERT INTO agent.workflow_runs
         (run_id, workflow_id, tenant_id, started_by, started_via, status, input_summary, started_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'chat', 'paused', $4::jsonb, now())
       RETURNING run_id`,
      [
        STAFFING_ORCHESTRATOR_WORKFLOW_ID,
        tenantId,
        userId,
        JSON.stringify({ taskId, thread_id: threadId }),
      ],
    );
    const runId = runRes.rows[0]?.run_id;
    if (!runId) throw new Error('write-chat-approval-row: workflow_runs INSERT returned no row');

    // Approval row consumed by the UI's pending-approvals poll. mastra_run_id +
    // tool_call_id carry the agentic-resume parameters Task 7 reads.
    const approvalRes = await client.query<{ approval_id: string }>(
      `INSERT INTO agent.workflow_approvals
         (approval_id, run_id, step_id, proposed_payload,
          approver_user_id, surface_canvas, surface_chat_thread_id,
          mastra_run_id, tool_call_id, status, expires_at, created_at)
       VALUES (gen_random_uuid(), $1, 'chat-hitl', $2, $3, false, $4, $5, $6, 'pending', $7, now())
       RETURNING approval_id`,
      [runId, JSON.stringify(card), userId, threadId, mastraRunId, toolCallId, expiresAt],
    );
    const approvalId = approvalRes.rows[0]?.approval_id;
    if (!approvalId)
      throw new Error('write-chat-approval-row: workflow_approvals INSERT returned no row');

    await client.query('COMMIT');
    return { runId, approvalId, cardInThread: threadId != null };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** A pending proposal exists for the task but its approval row is not readable
 *  yet (an evented assignBySkill run that has not reached its suspend step).
 *  Callers fail-open on this — the recommendation is still answered; only the
 *  one-click card is skipped, instead of racing the in-flight workflow. */
export class PendingAssignmentExistsError extends Error {
  constructor(taskId: string) {
    super(`an assignment proposal is already in flight for task ${taskId}`);
  }
}
