import type { Mastra } from '@mastra/core';
import { sql } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import type { SessionLike } from '../routes.ts';

export interface DecideApprovalOpts {
  session: SessionLike;
  approvalId: string;
  decision: 'approve' | 'reject' | 'modify';
  overrideUserId?: string;
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
    }
    const res = await tx.execute(sql`
      SELECT a.approval_id, a.run_id, a.step_id,
             a.approver_user_id, a.fallback_approver_user_id,
             a.surface_canvas, a.status,
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
      ...(opts.overrideUserId !== undefined ? { override_user_id: opts.overrideUserId } : {}),
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

    return { runId: row.run_id, workflowId: row.workflow_id, stepId: row.step_id };
  });

  const mastraTyped = opts.mastra as unknown as {
    getWorkflow: (id: string) =>
      | {
          createRun: (opts: { runId: string }) => Promise<{
            resume: (args: { step: string; resumeData: Record<string, unknown> }) => Promise<void>;
          }>;
        }
      | undefined;
  };
  const workflow = mastraTyped.getWorkflow(ctx.workflowId);
  if (!workflow) return { runId: ctx.runId, resumed: false };
  const run = await workflow.createRun({ runId: ctx.runId });
  if (!run) return { runId: ctx.runId, resumed: false };

  const resumeData: Record<string, unknown> = { decision: opts.decision };
  if (opts.overrideUserId !== undefined) resumeData.override_user_id = opts.overrideUserId;
  if (opts.note !== undefined) resumeData.note = opts.note;

  await run.resume({ step: ctx.stepId, resumeData });
  return { runId: ctx.runId, resumed: true };
}
