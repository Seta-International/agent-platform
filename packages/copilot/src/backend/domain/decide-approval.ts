import type { Mastra } from '@mastra/core';
import { sql } from 'drizzle-orm';
import { copilotDb } from '../db/index.ts';
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
  note?: string;
  mastra: Mastra;
}

export interface DecideApprovalResult {
  runId: string;
  resumed: boolean;
}

interface ApprovalDecisionContext {
  runId: string;
  workflowId: string;
  stepId: string;
  proposedPayload: unknown;
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
): Record<string, unknown> | undefined {
  const card = (ctx.proposedPayload ?? null) as ApprovalCardLike | null;
  if (!card) return undefined;
  if (decision === 'approve') return card.primary?.argsPatch;
  if (decision === 'reject') return card.decline?.argsPatch;
  // modify: substitute the user-composed assignee set into primary.argsPatch.
  // The UI can compose any subset of (or addition to) the candidate pool, so we
  // don't try to match an alternate — we always template off primary.
  if (decision === 'modify' && overrideUserIds && overrideUserIds.length > 0) {
    if (card.primary?.argsPatch) {
      return { ...card.primary.argsPatch, assigneeUserIds: overrideUserIds };
    }
  }
  return undefined;
}

export async function decideApproval(opts: DecideApprovalOpts): Promise<DecideApprovalResult> {
  if (!opts.session.effective_permissions.has('copilot.workflow.approve')) {
    throw Object.assign(new Error('forbidden: copilot.workflow.approve'), { code: 'forbidden' });
  }

  const ctx = await copilotDb().transaction(async (tx): Promise<ApprovalDecisionContext> => {
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
    }
    const res = await tx.execute(sql`
      SELECT a.approval_id, a.run_id, a.step_id,
             a.approver_user_id, a.fallback_approver_user_id,
             a.surface_canvas, a.status, a.proposed_payload,
             r.tenant_id, r.workflow_id
        FROM copilot.workflow_approvals a
        JOIN copilot.workflow_runs r ON r.run_id = a.run_id
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
    const isStepIn = perms.has('copilot.workflow.run.read.tenant') && row.surface_canvas;
    if (!isPrimary && !isFallback && !isStepIn) {
      throw Object.assign(new Error('forbidden: not_authorized_for_approval'), {
        code: 'forbidden',
      });
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
      UPDATE copilot.workflow_approvals
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
              'copilot.workflow.approval.decided', 1, ${JSON.stringify(outboxPayload)}::jsonb)
    `);

    return {
      runId: row.run_id,
      workflowId: row.workflow_id,
      stepId: row.step_id,
      proposedPayload: row.proposed_payload,
    };
  });

  const mastraTyped = opts.mastra as unknown as {
    getWorkflow: (id: string) =>
      | {
          createRun: (opts: { runId: string }) => Promise<{
            resume: (args: { step?: string; resumeData: Record<string, unknown> }) => Promise<void>;
          }>;
        }
      | undefined;
  };
  const workflow = mastraTyped.getWorkflow(ctx.workflowId);
  if (!workflow) return { runId: ctx.runId, resumed: false };
  const run = await workflow.createRun({ runId: ctx.runId });
  if (!run) return { runId: ctx.runId, resumed: false };

  // Translate the generic decision into the workflow's resumeSchema by
  // reading the ApprovalCard's argsPatch fields. Falls back to a passthrough
  // shape so older approvals (or workflows that don't carry argsPatch) at
  // least surface the decision instead of erroring.
  const fromCard = resumeDataFromDecision(ctx, opts.decision, opts.overrideUserIds);
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
  const resumeOpts: { step?: string; resumeData: Record<string, unknown> } =
    ctx.stepId && ctx.stepId !== 'await-approval'
      ? { step: ctx.stepId, resumeData }
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
      await copilotDb().execute(sql`
        UPDATE copilot.workflow_runs
           SET status = 'canceled',
               finished_at = now(),
               error_summary = ${`resume_failed: ${message}`}
         WHERE run_id = ${ctx.runId}
           AND status IN ('paused', 'running')
      `);
    } catch (cancelErr) {
      console.error('[copilot.decide-approval.cancel-on-resume-fail]', cancelErr);
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
