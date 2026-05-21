import { sql } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import type { SessionLike } from '../routes.ts';
import type { WorkflowRunRow, WorkflowRunStartedVia } from './list-workflow-runs.ts';

export interface GetWorkflowRunOpts {
  session: SessionLike;
  runId: string;
}

interface RawRow {
  run_id: string;
  workflow_id: string;
  tenant_id: string;
  started_by: string;
  started_via: WorkflowRunStartedVia;
  status: string;
  suspend_reason: string | null;
  error_summary: string | null;
  input_summary: unknown;
  started_at: Date | string;
  finished_at: Date | string | null;
  duration_ms: number | null;
}

export async function getWorkflowRun(opts: GetWorkflowRunOpts): Promise<WorkflowRunRow | null> {
  const db = copilotDb();
  const result = await db.execute(sql`
    SELECT run_id, workflow_id, tenant_id, started_by, started_via,
           status, suspend_reason, error_summary, input_summary,
           started_at, finished_at, duration_ms
      FROM copilot.workflow_runs
     WHERE run_id = ${opts.runId}
     LIMIT 1
  `);

  // drizzle execute() types result.rows as Record<string,unknown>[] regardless of query shape
  const rows = result.rows as unknown as RawRow[];
  const r = rows[0];
  if (!r) return null;

  const isOwn = r.started_by === opts.session.user_id;
  const sameTenant = r.tenant_id === opts.session.tenant_id;
  const perms = opts.session.effective_permissions;
  const canSee =
    (isOwn && sameTenant && perms.has('copilot.workflow.run.read.self')) ||
    (sameTenant && perms.has('copilot.workflow.run.read.tenant')) ||
    perms.has('copilot.workflow.run.read.instance');
  if (!canSee) return null;

  return {
    runId: r.run_id,
    workflowId: r.workflow_id,
    tenantId: r.tenant_id,
    startedBy: r.started_by,
    startedVia: r.started_via,
    status: r.status,
    suspendReason: r.suspend_reason,
    errorSummary: r.error_summary,
    inputSummary: r.input_summary,
    startedAt: r.started_at instanceof Date ? r.started_at : new Date(r.started_at),
    finishedAt:
      r.finished_at === null
        ? null
        : r.finished_at instanceof Date
          ? r.finished_at
          : new Date(r.finished_at),
    durationMs: r.duration_ms,
  };
}
