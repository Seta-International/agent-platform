import { sql } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import type { SessionLike } from '../routes.ts';

export interface WorkflowApprovalRow {
  approvalId: string;
  runId: string;
  stepId: string;
  proposedPayload: unknown;
  approverUserId: string;
  surfaceCanvas: boolean;
  surfaceChatThreadId: string | null;
  expiresAt: Date;
  createdAt: Date;
}

export async function listMyPendingApprovals(opts: {
  session: SessionLike;
}): Promise<WorkflowApprovalRow[]> {
  interface RawRow {
    approval_id: string;
    run_id: string;
    step_id: string;
    proposed_payload: unknown;
    approver_user_id: string;
    surface_canvas: boolean;
    surface_chat_thread_id: string | null;
    expires_at: Date | string;
    created_at: Date | string;
  }
  const db = copilotDb();
  const result = await db.execute(sql`
    SELECT approval_id, run_id, step_id, proposed_payload,
           approver_user_id, surface_canvas, surface_chat_thread_id,
           expires_at, created_at
      FROM copilot.workflow_approvals
     WHERE approver_user_id = ${opts.session.user_id}
       AND status = 'pending'
     ORDER BY created_at DESC
  `);
  const rows = (result as unknown as { rows: RawRow[] }).rows ?? (result as unknown as RawRow[]);
  return rows.map((r) => ({
    approvalId: r.approval_id,
    runId: r.run_id,
    stepId: r.step_id,
    proposedPayload: r.proposed_payload,
    approverUserId: r.approver_user_id,
    surfaceCanvas: r.surface_canvas,
    surfaceChatThreadId: r.surface_chat_thread_id,
    expiresAt: r.expires_at instanceof Date ? r.expires_at : new Date(r.expires_at),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));
}
