import type { ApprovalCard } from '@seta/agent-sdk';
import type { Pool, PoolClient } from 'pg';
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
 * FUT-806's assign REUSE branch, unchanged in behaviour and moved inside the
 * writer's transaction so it composes with the advisory lock.
 *
 * Returns the existing card's ids when there is one to reuse, null when the task
 * has no assignment proposal in flight, and throws
 * `PendingAssignmentExistsError` for the fail-open case: a pending evented run
 * that has not reached its suspend step, so there is no approval row to hand
 * back and racing it would spawn a duplicate.
 *
 * `getPendingAssignRunIdForTask` runs on its own connection (it takes no tx).
 * Safe: the advisory lock already serializes concurrent turns on this key, so by
 * the time this runs any competing turn has committed and is visible.
 */
async function reusePendingAssignCard(
  client: PoolClient,
  args: { taskId: string; tenantId: string; userId: string; threadId: string | null },
): Promise<WriteChatApprovalRowResult | null> {
  const existingRunId = await getPendingAssignRunIdForTask({
    taskId: args.taskId,
    tenantId: args.tenantId,
  });
  if (!existingRunId) return null;

  const existing = await client.query<{
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
  if (!row) {
    // A pending evented run exists but hasn't reached its suspend step, so there
    // is no approval row to reuse. Fail open: skip writing a competing card
    // rather than race the in-flight workflow.
    throw new PendingAssignmentExistsError(args.taskId);
  }

  // The pending card follows its approver: when the same user re-asks from a new
  // thread, rebind the card there so "the approval card above" stays true.
  // Another approver's card is never moved.
  const sameApprover = row.approver_user_id === args.userId;
  if (sameApprover && args.threadId && row.surface_chat_thread_id !== args.threadId) {
    await client.query(
      `UPDATE agent.workflow_approvals
          SET surface_chat_thread_id = $2
        WHERE approval_id = $1 AND status = 'pending'`,
      [row.approval_id, args.threadId],
    );
  }
  return {
    runId: existingRunId,
    approvalId: row.approval_id,
    cardInThread: sameApprover && args.threadId != null,
  };
}

/**
 * Void the approval this card replaces, inside the caller's transaction.
 *
 * Performed HERE rather than in the tool's first pass (design D8'). Superseding
 * in the tool leaves a real window where the old card is void and the new one
 * absent, opened by ANY read-model failure — `onApproval` swallows every one of
 * them by design (spec §0 finding 5), so that window is not crash-only. Doing it
 * inside the transaction that already exists means no committed instant has two
 * pending cards for one task, and none has zero.
 *
 * Scoped by tenant + approver + `mastra_run_id IS NOT NULL`: the actor is
 * replacing THEIR OWN chat proposal. Deliberately does NOT require
 * `agent.workflow.run.cancel` — that permission is for cancelling somebody's
 * run, which this is not. RBAC is re-checked at the callee by
 * `approver_user_id = actor`.
 *
 * A row that is no longer `pending` is NOT an error. The user may have Confirmed
 * the stale card while the revision was still narrating; Confirm wins, and this
 * becomes a no-op. Safe because the `task:` key is free again, the new card's
 * targets still came from the old card, and the fresh idempotency key means the
 * final state is the merged patch — the user's intent. Throwing instead would
 * destroy the new card of a user who did nothing wrong.
 */
async function supersedeReplacedApproval(
  client: PoolClient,
  args: { approvalId: string; tenantId: string; userId: string },
): Promise<void> {
  const locked = await client.query<{ run_id: string }>(
    `SELECT a.run_id
       FROM agent.workflow_approvals a
      WHERE a.approval_id       = $1
        AND a.tenant_id         = $2
        AND a.approver_user_id  = $3
        AND a.status            = 'pending'
        AND a.mastra_run_id IS NOT NULL
      FOR UPDATE OF a`,
    [args.approvalId, args.tenantId, args.userId],
  );
  const row = locked.rows[0];
  if (!row) return;

  await client.query(
    `UPDATE agent.workflow_approvals
        SET status           = 'superseded',
            decision_payload = jsonb_build_object('reason', 'revised'),
            decided_at       = now()
      WHERE approval_id = $1`,
    [args.approvalId],
  );

  // Close the synthetic run row (design D13). Safe for `superseded` precisely
  // because nothing will ever resume it: `replayableDecision` requires
  // `a.status='approved'` and `resumeRetry` requires
  // `a.status IN ('approved','rejected','modified')`, so neither can reach a
  // superseded row whatever its run status. The single-`l` spelling is what
  // WORKFLOW_RUN_STATUS declares.
  await client.query(
    `UPDATE agent.workflow_runs
        SET status = 'canceled', finished_at = now()
      WHERE run_id = $1
        AND status IN ('paused', 'running')`,
    [row.run_id],
  );
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

  const taskId = taskIdFromCard(card);
  const expiresAt = new Date(Date.now() + approvalTtlHours * 60 * 60 * 1000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Serialize every turn that touches one of these keys ───────────────
    // A transaction-level advisory lock, not a pre-check (design D16): a
    // pre-check plus a best-effort guard cannot honour AC1's "at no point are two
    // previews for the same task waiting", because two concurrent turns both see
    // a clear table and both INSERT. Taken in SORTED order so a 20-key bulk card
    // and a single-key card cannot deadlock against each other; released on
    // COMMIT/ROLLBACK with no bookkeeping.
    //
    // hashtext collisions would serialize two unrelated keys. That is a
    // throughput nit, never a correctness bug: the checks below run inside the
    // lock and decide on the real key string.
    for (const key of [...dedupKeys].sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${tenantId}:${key}`]);
    }

    // ── 2. Supersede the card this one replaces ──────────────────────────────
    // BEFORE the mutex check, and this order is load-bearing: the row being
    // voided holds the very `task:` key the new card declares, so checking the
    // mutex first would make it refuse every single revision.
    if (card.meta.supersedes) {
      await supersedeReplacedApproval(client, {
        approvalId: card.meta.supersedes,
        tenantId,
        userId,
      });
    }

    // ── 3. The mutex, in DECLARATION order, first hit wins (design D11) ──────
    // Two behaviours on purpose. `assign:` keeps FUT-806's REUSE, because its
    // lookup also spans the evented planner.assignBySkill run and changing it is
    // outside this story. `task:` REFUSES, because handing back a due-date card
    // in reply to a rename request answers a question the user did not ask.
    // Order matters: an A2 assign card carries BOTH keys, so without a stated
    // precedence the same card satisfies a reuse rule and a refuse rule at once.
    for (const key of dedupKeys) {
      const assignTaskId = taskIdFromDedupKey(key, ASSIGN_DEDUP_PREFIX);
      if (assignTaskId) {
        const reused = await reusePendingAssignCard(client, {
          taskId: assignTaskId,
          tenantId,
          userId,
          threadId,
        });
        if (reused) {
          await client.query('COMMIT');
          return reused;
        }
        continue;
      }
      const previewTaskId = taskIdFromDedupKey(key, TASK_DEDUP_PREFIX);
      if (previewTaskId) {
        const clash = await client.query(
          `SELECT 1 FROM agent.workflow_approvals
            WHERE tenant_id = $1
              AND status = 'pending'
              AND jsonb_exists(proposed_payload -> 'meta' -> 'dedupKeys', $2)
            LIMIT 1`,
          [tenantId, key],
        );
        if (clash.rowCount && clash.rowCount > 0) {
          throw new PendingTaskPreviewExistsError(previewTaskId);
        }
      }
    }

    // ── 4. The rows themselves ───────────────────────────────────────────────
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

/**
 * A pending preview already exists for this task, so a second one is refused
 * (design D11). Unlike the assign mutex, there is nothing to hand back: reusing
 * a due-date card in reply to a rename request would answer a question the user
 * did not ask.
 *
 * The mutex is per TENANT, matching the assign mutex (design D18), so the other
 * card may belong to a different approver. The message therefore names the TASK
 * and never the person.
 */
export class PendingTaskPreviewExistsError extends Error {
  constructor(readonly taskId: string) {
    super(
      'There is already a proposal waiting for that task. ' +
        'Confirm or cancel it first, then ask me again.',
    );
    this.name = 'PendingTaskPreviewExistsError';
  }
}
