import type { Mastra } from '@mastra/core';
import { sql } from 'drizzle-orm';
import { agentDb } from '../db/index.ts';
import type { SessionLike } from '../types.ts';

export interface DecideApprovalOpts {
  session: SessionLike;
  approvalId: string;
  decision: 'approve' | 'reject' | 'modify';
  /**
   * For 'modify' decisions: the assignee set the user composed in the UI. The
   * workflow's primary.argsPatch is taken as the template and its
   * `assigneeUserIds` field is replaced with this array. A planner task can
   * have multiple assignees, so this is plural by contract.
   */
  overrideUserIds?: string[];
  /**
   * For 'approve' decisions on alternates: indices into the card's
   * `alternates[]` array. When a single index is set, uses
   * `alternates[N].argsPatch` as resumeData. When multiple indices are set,
   * merges their `existingId` fields into an `existingIds` array with
   * `kind: 'link'`.
   */
  alternateIndex?: number;
  alternateIndices?: number[];
  note?: string;
  mastra: Mastra;
  log?: {
    error: (obj: unknown, msg?: string) => void;
  };
}

export interface DecideApprovalResult {
  runId: string;
  resumed: boolean;
  /** True for native-suspend agentic chat cards (the row carries mastra_run_id).
   *  The generic decide route records the decision but does NOT stream-resume;
   *  agentic cards are continued exclusively via POST /chat/resume. */
  agentic?: boolean;
}

export interface ApprovalDecisionContext {
  runId: string;
  workflowId: string;
  stepId: string;
  proposedPayload: unknown;
  /** Native-suspend resume parameters (null for evented/chat-HITL approvals). */
  mastraRunId: string | null;
  toolCallId: string | null;
  surfaceChatThreadId: string | null;
}

/** Inputs to the transactional decision-recording core, shared by the generic
 *  decide route (decideApproval) and the agentic POST /chat/resume route. */
export interface RecordApprovalDecisionOpts {
  session: SessionLike;
  approvalId: string;
  decision: 'approve' | 'reject' | 'modify';
  overrideUserIds?: string[];
  note?: string;
  /** When true (the /chat/resume route), require the row to be an agentic
   *  native-suspend card (mastra_run_id set). Rejected INSIDE the transaction
   *  before any write, so a misrouted evented row never records a decision it
   *  can't resume. */
  requireMastraRun?: boolean;
}

interface ApprovalCardLike {
  primary?: { argsPatch?: Record<string, unknown> };
  alternates?: ReadonlyArray<{ argsPatch?: Record<string, unknown> }>;
  decline?: { argsPatch?: Record<string, unknown> };
}

/**
 * Translate a generic decide-approval decision (approve/reject/modify) into
 * the workflow's resumeData by reading the ApprovalCard's argsPatch fields.
 *
 * Contract: every workflow that uses HITL via the inbox builds its suspend
 * payload as an ApprovalCard whose primary/alternates/decline argsPatch IS
 * the resumeSchema-shaped payload. The inbox path forwards that through.
 */
function resumeDataFromDecision(
  ctx: ApprovalDecisionContext,
  decision: 'approve' | 'reject' | 'modify',
  overrideUserIds: string[] | undefined,
  alternateIndex: number | undefined,
  alternateIndices: number[] | undefined,
): Record<string, unknown> | undefined {
  const card = (ctx.proposedPayload ?? null) as ApprovalCardLike | null;
  if (!card) return undefined;
  if (decision === 'approve') {
    // Multi-select: merge existingId from each alternate into existingIds array
    const indices = alternateIndices ?? (alternateIndex !== undefined ? [alternateIndex] : []);
    if (indices.length > 0 && card.alternates) {
      const existingIds: string[] = [];
      for (const idx of indices) {
        const alt = card.alternates[idx];
        if (alt?.argsPatch) {
          const id = (alt.argsPatch as { existingId?: string }).existingId;
          if (id) existingIds.push(id);
        }
      }
      if (existingIds.length > 0) {
        return { kind: 'link', existingIds };
      }
    }
    return card.primary?.argsPatch;
  }
  if (decision === 'reject') return card.decline?.argsPatch;
  // modify: substitute the user-composed assignee set into primary.argsPatch.
  if (decision === 'modify' && overrideUserIds && overrideUserIds.length > 0) {
    if (card.primary?.argsPatch) {
      return { ...card.primary.argsPatch, assigneeUserIds: overrideUserIds };
    }
  }
  return undefined;
}

/**
 * Transactional decision-recording core. Locks the approval row FOR UPDATE,
 * re-checks tenant + approver authorization + the agent.workflow.approve
 * permission, writes the decision status/payload, and inserts the
 * `agent.workflow.approval.decided` outbox event — all in one transaction.
 *
 * Shared by:
 *  • decideApproval (generic decide route) — then runs its post-commit resume.
 *  • POST /chat/resume (agentic chat cards) — then streams the resume itself,
 *    reading mastraRunId/toolCallId/surfaceChatThreadId/proposedPayload off the
 *    returned ctx.
 *
 * Throws domain errors with a `code` field: 'forbidden' | 'not_found' |
 * 'already_decided'.
 */
export async function recordApprovalDecision(
  opts: RecordApprovalDecisionOpts,
): Promise<ApprovalDecisionContext> {
  if (!opts.session.effective_permissions.has('agent.workflow.approve')) {
    throw Object.assign(new Error('forbidden: agent.workflow.approve'), { code: 'forbidden' });
  }

  return agentDb().transaction(async (tx): Promise<ApprovalDecisionContext> => {
    interface Row {
      approval_id: string;
      run_id: string;
      step_id: string;
      approver_user_id: string;
      fallback_approver_user_id: string | null;
      surface_canvas: boolean;
      status: string;
      tenant_id: string;
      workflow_id: string;
      proposed_payload: unknown;
      mastra_run_id: string | null;
      tool_call_id: string | null;
      surface_chat_thread_id: string | null;
    }
    const res = await tx.execute(sql`
      SELECT a.approval_id, a.run_id, a.step_id,
             a.approver_user_id, a.fallback_approver_user_id,
             a.surface_canvas, a.status, a.proposed_payload,
             a.mastra_run_id, a.tool_call_id, a.surface_chat_thread_id,
             r.tenant_id, r.workflow_id
        FROM agent.workflow_approvals a
        JOIN agent.workflow_runs r ON r.run_id = a.run_id
       WHERE a.approval_id = ${opts.approvalId}
       FOR UPDATE OF a
    `);
    const rows = (res as unknown as { rows: Row[] }).rows ?? (res as unknown as Row[]);
    const row = rows[0];
    if (!row) throw Object.assign(new Error('not_found'), { code: 'not_found' });
    if (row.status !== 'pending') {
      throw Object.assign(new Error('already_decided'), { code: 'already_decided' });
    }

    if (row.tenant_id !== opts.session.tenant_id) {
      throw Object.assign(new Error('forbidden: cross_tenant'), { code: 'forbidden' });
    }

    const perms = opts.session.effective_permissions;
    const isPrimary = row.approver_user_id === opts.session.user_id;
    const isFallback = row.fallback_approver_user_id === opts.session.user_id;
    const isStepIn = perms.has('agent.workflow.run.read.tenant') && row.surface_canvas;
    if (!isPrimary && !isFallback && !isStepIn) {
      throw Object.assign(new Error('forbidden: not_authorized_for_approval'), {
        code: 'forbidden',
      });
    }

    if (opts.requireMastraRun && row.mastra_run_id == null) {
      throw Object.assign(new Error('not_resumable'), { code: 'not_resumable' });
    }

    const decisionStatus =
      opts.decision === 'reject'
        ? 'rejected'
        : opts.decision === 'modify'
          ? 'modified'
          : 'approved';
    const decisionPayload = {
      decision: opts.decision,
      ...(opts.overrideUserIds !== undefined ? { override_user_ids: opts.overrideUserIds } : {}),
      ...(opts.note !== undefined ? { note: opts.note } : {}),
    };
    await tx.execute(sql`
      UPDATE agent.workflow_approvals
         SET status = ${decisionStatus},
             decision_payload = ${JSON.stringify(decisionPayload)}::jsonb,
             decided_by = ${opts.session.user_id},
             decided_at = now()
       WHERE approval_id = ${opts.approvalId}
    `);

    const outboxPayload: Record<string, unknown> = {
      approval_id: row.approval_id,
      decision: opts.decision,
      decided_by: opts.session.user_id,
      decided_at: new Date().toISOString(),
    };
    if (opts.note !== undefined) outboxPayload.note = opts.note;
    await tx.execute(sql`
      INSERT INTO core.events (id, tenant_id, aggregate_type, aggregate_id, event_type, event_version, payload)
      VALUES (gen_random_uuid(), ${row.tenant_id}, 'workflow_run', ${row.run_id},
              'agent.workflow.approval.decided', 1, ${JSON.stringify(outboxPayload)}::jsonb)
    `);

    return {
      runId: row.run_id,
      workflowId: row.workflow_id,
      stepId: row.step_id,
      proposedPayload: row.proposed_payload,
      mastraRunId: row.mastra_run_id,
      toolCallId: row.tool_call_id,
      surfaceChatThreadId: row.surface_chat_thread_id,
    };
  });
}

export async function decideApproval(opts: DecideApprovalOpts): Promise<DecideApprovalResult> {
  const ctx = await recordApprovalDecision({
    session: opts.session,
    approvalId: opts.approvalId,
    decision: opts.decision,
    overrideUserIds: opts.overrideUserIds,
    note: opts.note,
  });

  // ── Agentic native-suspend chat card ─────────────────────────────────────
  // The row carries mastra_run_id — this approval belongs to a suspended
  // orchestrator run. The generic decide route only records the decision; the
  // stream-resume continuation runs exclusively through POST /chat/resume.
  if (ctx.mastraRunId) {
    return { runId: ctx.runId, resumed: true, agentic: true };
  }

  const mastraTyped = opts.mastra as unknown as {
    getWorkflow: (id: string) =>
      | {
          createRun: (opts: { runId: string }) => Promise<{
            resume: (args: {
              step?: string | string[];
              resumeData: Record<string, unknown>;
            }) => Promise<void>;
          }>;
        }
      | undefined;
  };

  // ── Evented-workflow HITL path ───────────────────────────────────────────
  const workflow = mastraTyped.getWorkflow(ctx.workflowId);
  if (!workflow) return { runId: ctx.runId, resumed: false };
  const run = await workflow.createRun({ runId: ctx.runId });
  if (!run) return { runId: ctx.runId, resumed: false };

  // Translate the generic decision into the workflow's resumeSchema by
  // reading the ApprovalCard's argsPatch fields. Falls back to a passthrough
  // shape so older approvals (or workflows that don't carry argsPatch) at
  // least surface the decision instead of erroring.
  const fromCard = resumeDataFromDecision(
    ctx,
    opts.decision,
    opts.overrideUserIds,
    opts.alternateIndex,
    opts.alternateIndices,
  );
  const resumeData: Record<string, unknown> = fromCard ?? {
    decision: opts.decision,
    ...(opts.overrideUserIds !== undefined ? { override_user_ids: opts.overrideUserIds } : {}),
  };
  if (opts.note !== undefined && resumeData.note === undefined) {
    resumeData.note = opts.note;
  }

  // Only pass `step` when the projection captured a real step id. Older
  // adapter versions stored the 'await-approval' placeholder, and passing a
  // non-existent step makes Mastra's resume throw — let it auto-resolve from
  // the snapshot's suspendedPaths in that case.
  // IMPORTANT: pass step as an array to prevent Mastra from splitting on '.'
  // (step IDs like 'assignBySkill.suggest' would be incorrectly treated as
  // nested workflow paths if passed as a plain string).
  const resumeOpts: { step?: string[]; resumeData: Record<string, unknown> } =
    ctx.stepId && ctx.stepId !== 'await-approval'
      ? { step: [ctx.stepId], resumeData }
      : { resumeData };
  try {
    await run.resume(resumeOpts);
  } catch (err) {
    // run.resume() runs AFTER the DB transaction commits. If it throws here
    // (e.g. legacy approval with no card to translate, or workflow code raised)
    // Mastra never advances the workflow, so workflow_runs.status would stay
    // 'paused' forever even though the user explicitly decided. Mark the run
    // as canceled with the error so the UI clearly reflects "this run is
    // done — start fresh", instead of leaving it hung.
    const message = err instanceof Error ? err.message : String(err);
    try {
      await agentDb().execute(sql`
        UPDATE agent.workflow_runs
           SET status = 'canceled',
               finished_at = now(),
               error_summary = ${`resume_failed: ${message}`}
         WHERE run_id = ${ctx.runId}
           AND status IN ('paused', 'running')
      `);
    } catch (cancelErr) {
      if (opts.log) {
        opts.log.error(
          { subsystem: 'agent.decide-approval', runId: ctx.runId, err: cancelErr },
          'cancel-on-resume-fail update failed',
        );
      } else {
        console.error('[agent.decide-approval.cancel-on-resume-fail]', cancelErr);
      }
    }
    // For Reject the user wanted the run to end, and canceling it does exactly
    // that — return success even though resume failed. For Approve/Modify the
    // user wanted the workflow to take an action; surface the failure so the
    // UI can tell them their decision didn't go through as intended.
    if (opts.decision === 'reject') return { runId: ctx.runId, resumed: false };
    throw err;
  }
  return { runId: ctx.runId, resumed: true };
}
