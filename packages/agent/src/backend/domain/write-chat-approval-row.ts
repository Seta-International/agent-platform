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
//   • workflow_id = 'planner.assignment-orchestrator' (the agentic run's logical id)
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
export const ASSIGNMENT_ORCHESTRATOR_WORKFLOW_ID = 'planner.assignment-orchestrator';

/**
 * The runtime that must resume this card, as the card itself declares it.
 *
 * Read off `meta.workflowId` rather than from a tool-id allowlist here: the
 * agent tier may not import feature modules (`agent-no-feature-imports`), so any
 * list kept here would need updating by hand for every new action tool — which
 * is exactly how planner_linkTasks ended up stamped with the assignment contract
 * and had its Confirm rejected. A card that declares nothing keeps the legacy
 * assignment behaviour.
 */
export function resumeWorkflowIdForCard(card: ApprovalCard): string {
  return card.meta.workflowId ?? ASSIGNMENT_ORCHESTRATOR_WORKFLOW_ID;
}

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
  /** Logical workflow id stamped on the synthetic run row. It is the
   *  discriminator /chat/resume dispatches on, so it MUST name the runtime that
   *  will resume this card. Defaults to whatever the card declares. */
  workflowId?: string;
  /**
   * One-preview-per-task mutex, keyed by strings the CARD declares. Defaults to
   * the card's own `meta.dedupKeys` (with the legacy `meta.dedupKey` lifted in);
   * pass `[]` to force every mutex off.
   *
   * Keyed by declaration rather than by workflow id (design D7): the agent tier
   * may not import feature modules, so a list of "assignment-ish" tools kept here
   * would need hand-editing for every new action tool — which is how
   * planner_linkTasks ended up with the assignment resume contract.
   */
  dedupKeys?: string[];
}

export interface WriteChatApprovalRowResult {
  runId: string;
  approvalId: string;
  /** True when the card surfaces in the caller's current thread (same approver,
   *  in a thread). False when reusing another approver's existing card. */
  cardInThread: boolean;
}

/** The prefix the assign mutex uses. The agent tier knows these TWO formats and
 *  nothing else about the keys — not the tool, not the module, not the runtime. */
export const ASSIGN_DEDUP_PREFIX = 'assign:';
/** The prefix the generalized one-preview-per-task mutex uses (design D11). */
export const TASK_DEDUP_PREFIX = 'task:';

/**
 * The keys a card declares, reading the plural field and falling back to the
 * legacy singular one.
 *
 * The fallback is load-bearing for exactly ONE release (spec §3.2). There is no
 * DDL and no backfill, but a card written before FUT-840 carries
 * `meta.dedupKey: 'assign:<taskId>'`, and without this it would fall out of the
 * assign mutex — making a second assignment proposal for that task possible —
 * and out of `supersede-stale-assign-approvals`, leaving a stale assign card
 * pending until the 72-hour sweeper. Delete the fallback, and `meta.dedupKey`
 * with it, once no pending row can carry it.
 */
export function dedupKeysFromCard(card: ApprovalCard): string[] {
  const { dedupKeys, dedupKey } = card.meta;
  if (dedupKeys && dedupKeys.length > 0) return dedupKeys;
  return dedupKey ? [dedupKey] : [];
}

/**
 * The task a key names, or null when the key carries a different prefix.
 *
 * The assign mutex needs a taskId because its lookup —
 * `getPendingAssignRunIdForTask` — spans the evented `planner.assignBySkill` run
 * as well as the chat card, and that query matches on `input_summary.taskId`. A
 * key carrying an unknown prefix therefore falls through to "no mutex" rather
 * than silently reusing another prefix's lookup.
 */
export function taskIdFromDedupKey(key: string, prefix: string): string | null {
  if (!key.startsWith(prefix)) return null;
  const taskId = key.slice(prefix.length);
  return taskId.length > 0 ? taskId : null;
}

/** The task this card is about, for the synthetic run's `input_summary`. Best
 *  effort: a card with no task (a future non-task preview) records null. */
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
    workflowId = resumeWorkflowIdForCard(card),
    dedupKeys = dedupKeysFromCard(card),
  } = opts;

  // Mutex: if a pending assignment proposal already exists for this task —
  // chat-HITL, native-suspend, or an in-flight evented assignBySkill run —
  // reuse it instead of inserting a competing card.
  const taskId = taskIdFromCard(card);
  const mutexTaskId = dedupKeys
    .map((k) => taskIdFromDedupKey(k, ASSIGN_DEDUP_PREFIX))
    .find((id) => id !== null);
  if (mutexTaskId) {
    const existingRunId = await getPendingAssignRunIdForTask({ taskId: mutexTaskId, tenantId });
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
      throw new PendingAssignmentExistsError(mutexTaskId);
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
      [workflowId, tenantId, userId, JSON.stringify({ taskId, thread_id: threadId })],
    );
    const runId = runRes.rows[0]?.run_id;
    if (!runId) throw new Error('write-chat-approval-row: workflow_runs INSERT returned no row');

    // Approval row consumed by the UI's pending-approvals poll. mastra_run_id +
    // tool_call_id carry the agentic-resume parameters Task 7 reads.
    const approvalRes = await client.query<{ approval_id: string }>(
      `INSERT INTO agent.workflow_approvals
         (approval_id, run_id, tenant_id, step_id, proposed_payload,
          approver_user_id, surface_canvas, surface_chat_thread_id,
          mastra_run_id, tool_call_id, status, expires_at, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'chat-hitl', $3, $4, false, $5, $6, $7, 'pending', $8, now())
       RETURNING approval_id`,
      [runId, tenantId, JSON.stringify(card), userId, threadId, mastraRunId, toolCallId, expiresAt],
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
