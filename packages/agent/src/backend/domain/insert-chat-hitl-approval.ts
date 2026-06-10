import { type ApprovalCard, CHAT_HITL_WORKFLOW_ID_PREFIX } from '@seta/agent-sdk';
import type { Pool } from 'pg';

// ─────────────────────────────────────────────────────────────────────────────
// Atomic DB write for chat-flow HITL approval rows.
//
// WHY THIS EXISTS
// ───────────────
// In the Mastra evented-workflow path the lifecycle hook (lifecycle-hook.ts)
// creates agent.workflow_approvals rows automatically via the `workflow.suspend`
// pubsub event.  In the chat-flow (agent.stream()) that event is NEVER emitted
// — Mastra only signals suspension via an in-process SSE chunk, not the global
// pubsub.  So chat-flow tools must write the record themselves.
//
// This function is the single, authoritative writer for chat-HITL approvals.
// It creates:
//   • A synthetic agent.workflow_runs row  (status = 'paused', started_via = 'chat')
//     with workflow_id = `__chat_hitl:<toolId>`.  The prefix lets decide-approval
//     detect chat rows and skip the (inapplicable) mastra.getWorkflow().resume()
//     call.  The FK from workflow_approvals requires this row to exist first.
//   • One agent.workflow_approvals row  (status = 'pending', surface_canvas = false)
//     with surface_chat_thread_id populated so the frontend's
//     useThreadPendingApprovals hook can find it.
//
// Both writes are in a single transaction so a partial failure leaves no orphans.
// ─────────────────────────────────────────────────────────────────────────────

export interface InsertChatHitlApprovalOpts {
  card: ApprovalCard;
  tenantId: string;
  userId: string;
  /** The current chat thread ID from requestContext — null if not in a thread. */
  threadId: string | null;
  pool: Pool;
  /** Hours until the approval expires. Defaults to 72 (matching evented workflows). */
  approvalTtlHours?: number;
}

export interface ChatHitlApprovalIds {
  runId: string;
  approvalId: string;
}

/**
 * Atomically creates the synthetic workflow_runs + workflow_approvals rows
 * for a chat-flow HITL approval.  Returns the IDs of both rows.
 */
export async function insertChatHitlApproval(
  opts: InsertChatHitlApprovalOpts,
): Promise<ChatHitlApprovalIds> {
  const { card, tenantId, userId, threadId, pool, approvalTtlHours = 72 } = opts;
  const workflowId = `${CHAT_HITL_WORKFLOW_ID_PREFIX}${card.meta.toolId}`;
  const expiresAt = new Date(Date.now() + approvalTtlHours * 60 * 60 * 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Synthetic workflow run row — required by the FK on workflow_approvals.
    // workflow_id encodes the tool so decide-approval can route the decision.
    const runRes = await client.query<{ run_id: string }>(
      `INSERT INTO agent.workflow_runs
         (run_id, workflow_id, tenant_id, started_by, started_via, status, input_summary, started_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'chat', 'paused', $4::jsonb, now())
       RETURNING run_id`,
      [
        workflowId,
        tenantId,
        userId,
        JSON.stringify({ tool_id: card.meta.toolId, thread_id: threadId }),
      ],
    );
    const runId = runRes.rows[0]?.run_id;
    if (!runId) throw new Error('insert-chat-hitl-approval: workflow_runs INSERT returned no row');

    // Approval row consumed by the UI's pending-approvals poll.
    // surface_canvas = false: this card lives in the thread, not the workflow canvas.
    const approvalRes = await client.query<{ approval_id: string }>(
      `INSERT INTO agent.workflow_approvals
         (approval_id, run_id, step_id, proposed_payload,
          approver_user_id, surface_canvas, surface_chat_thread_id,
          status, expires_at, created_at)
       VALUES (gen_random_uuid(), $1, 'chat-hitl', $2, $3, false, $4, 'pending', $5, now())
       RETURNING approval_id`,
      [runId, JSON.stringify(card), userId, threadId, expiresAt],
    );
    const approvalId = approvalRes.rows[0]?.approval_id;
    if (!approvalId)
      throw new Error('insert-chat-hitl-approval: workflow_approvals INSERT returned no row');

    await client.query('COMMIT');
    return { runId, approvalId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
