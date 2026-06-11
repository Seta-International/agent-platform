import { sql } from 'drizzle-orm';
import { agentDb } from '../db/index.ts';
import type { SessionLike } from '../types.ts';

export interface ThreadApprovalRow {
  approvalId: string;
  runId: string;
  stepId: string;
  proposedPayload: unknown;
  approverUserId: string;
  surfaceCanvas: boolean;
  surfaceChatThreadId: string | null;
  agentic: boolean;
  status: string;
  decisionPayload: unknown;
  decidedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * All approvals (pending AND decided) addressed to the caller in one chat
 * thread, oldest first. Powers the in-thread approval cards: pending rows
 * render interactive, decided rows render as persistent outcome rows — so
 * deciding never has to append a chat message or start a new agent turn.
 *
 * Companion to listMyPendingApprovals (the cross-thread inbox), which stays
 * status='pending' only.
 */
export async function listThreadApprovals(opts: {
  session: SessionLike;
  threadId: string;
}): Promise<ThreadApprovalRow[]> {
  interface RawRow {
    approval_id: string;
    run_id: string;
    step_id: string;
    proposed_payload: unknown;
    approver_user_id: string;
    surface_canvas: boolean;
    surface_chat_thread_id: string | null;
    mastra_run_id: string | null;
    status: string;
    decision_payload: unknown;
    decided_at: Date | string | null;
    expires_at: Date | string;
    created_at: Date | string;
  }
  const db = agentDb();
  const result = await db.execute(sql`
    SELECT approval_id, run_id, step_id, proposed_payload,
           approver_user_id, surface_canvas, surface_chat_thread_id,
           mastra_run_id, status, decision_payload, decided_at, expires_at, created_at
      FROM agent.workflow_approvals
     WHERE approver_user_id = ${opts.session.user_id}
       AND surface_chat_thread_id = ${opts.threadId}
     ORDER BY created_at ASC
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
    agentic: r.mastra_run_id != null,
    status: r.status,
    decisionPayload: r.decision_payload ?? null,
    decidedAt:
      r.decided_at == null
        ? null
        : r.decided_at instanceof Date
          ? r.decided_at
          : new Date(r.decided_at),
    expiresAt: r.expires_at instanceof Date ? r.expires_at : new Date(r.expires_at),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  }));
}
