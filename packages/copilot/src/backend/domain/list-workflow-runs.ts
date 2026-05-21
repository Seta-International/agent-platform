import { sql } from 'drizzle-orm';
import { copilotDb } from '../../db/index.ts';
import type { SessionLike } from '../routes.ts';

export type WorkflowRunScope = 'self' | 'group' | 'tenant' | 'instance';

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'success'
  | 'failed'
  | 'tripwire'
  | 'canceled';

export type WorkflowRunStartedVia = 'event' | 'chat' | 'rerun';

export interface WorkflowRunFilters {
  status?: ReadonlyArray<WorkflowRunStatus>;
  startedVia?: ReadonlyArray<WorkflowRunStartedVia>;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface ListWorkflowRunsOpts {
  session: SessionLike;
  scope: WorkflowRunScope;
  filters?: WorkflowRunFilters;
  cursor?: string;
  limit?: number;
}

export interface WorkflowRunRow {
  runId: string;
  workflowId: string;
  tenantId: string;
  startedBy: string;
  startedVia: WorkflowRunStartedVia;
  status: string;
  suspendReason: string | null;
  errorSummary: string | null;
  inputSummary: unknown;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
}

export interface ListWorkflowRunsResult {
  rows: WorkflowRunRow[];
  nextCursor: string | null;
}

const SCOPE_PERMISSIONS: Record<WorkflowRunScope, string> = {
  self: 'copilot.workflow.run.read.self',
  group: 'copilot.workflow.run.read.tenant',
  tenant: 'copilot.workflow.run.read.tenant',
  instance: 'copilot.workflow.run.read.instance',
};

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
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
}

export async function listWorkflowRuns(
  opts: ListWorkflowRunsOpts,
): Promise<ListWorkflowRunsResult> {
  const required = SCOPE_PERMISSIONS[opts.scope];
  if (!opts.session.effective_permissions.has(required)) {
    throw Object.assign(new Error(`forbidden: ${required}`), { code: 'forbidden' });
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const filters = opts.filters ?? {};
  const tenantId = opts.session.tenant_id;
  const userId = opts.session.user_id;

  const conditions: ReturnType<typeof sql>[] = [];

  switch (opts.scope) {
    case 'self':
      conditions.push(sql`tenant_id = ${tenantId}::uuid AND started_by = ${userId}::uuid`);
      break;
    case 'group':
    case 'tenant':
      conditions.push(sql`tenant_id = ${tenantId}::uuid`);
      break;
    case 'instance':
      break;
  }

  if (filters.status && filters.status.length > 0) {
    const statusList = filters.status as string[];
    const statusSql = statusList
      .map((s) => sql`${s}`)
      .reduce((acc, c, i) => (i === 0 ? c : sql`${acc}, ${c}`), sql``);
    conditions.push(sql`status = ANY(ARRAY[${statusSql}])`);
  }
  if (filters.startedVia && filters.startedVia.length > 0) {
    const viaList = filters.startedVia as string[];
    const viaSql = viaList
      .map((v) => sql`${v}`)
      .reduce((acc, c, i) => (i === 0 ? c : sql`${acc}, ${c}`), sql``);
    conditions.push(sql`started_via = ANY(ARRAY[${viaSql}])`);
  }
  if (filters.dateFrom) {
    conditions.push(sql`started_at >= ${filters.dateFrom}::timestamptz`);
  }
  if (filters.dateTo) {
    conditions.push(sql`started_at <= ${filters.dateTo}::timestamptz`);
  }
  if (filters.search) {
    const like = `%${filters.search}%`;
    const prefix = `${filters.search}%`;
    conditions.push(
      sql`(run_id::text LIKE ${prefix} OR input_summary->>'taskTitle' ILIKE ${like})`,
    );
  }

  const cursor = opts.cursor ? parseCursor(opts.cursor) : null;
  if (cursor) {
    conditions.push(
      sql`(started_at, run_id) < (${new Date(cursor.startedAt)}::timestamptz, ${cursor.runId}::uuid)`,
    );
  }

  const whereClause =
    conditions.length === 0
      ? sql``
      : sql`WHERE ${conditions.reduce((acc, c, i) => (i === 0 ? c : sql`${acc} AND ${c}`), sql``)}`;

  const db = copilotDb();
  const result = await db.execute(sql`
    SELECT run_id, workflow_id, tenant_id, started_by, started_via,
           status, suspend_reason, error_summary, input_summary,
           started_at, finished_at, duration_ms
      FROM copilot.workflow_runs
      ${whereClause}
     ORDER BY started_at DESC, run_id DESC
     LIMIT ${limit + 1}
  `);

  // drizzle execute() types result.rows as Record<string,unknown>[] regardless of the query shape
  const rawRows = result.rows as unknown as RawRow[];
  const hasMore = rawRows.length > limit;
  const trimmed = rawRows.slice(0, limit);
  const last = trimmed[trimmed.length - 1];
  const camelRows = trimmed.map(toCamel);

  return {
    rows: camelRows,
    nextCursor:
      hasMore && last
        ? buildCursor({ startedAt: camelRows[camelRows.length - 1]!.startedAt, runId: last.run_id })
        : null,
  };
}

function toCamel(r: RawRow): WorkflowRunRow {
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
    startedAt: r.started_at instanceof Date ? r.started_at : new Date(r.started_at as string),
    finishedAt:
      r.finished_at == null
        ? null
        : r.finished_at instanceof Date
          ? r.finished_at
          : new Date(r.finished_at as string),
    durationMs: r.duration_ms,
  };
}

function parseCursor(c: string): { startedAt: string; runId: string } {
  const decoded = Buffer.from(c, 'base64url').toString('utf8');
  const pipeIdx = decoded.indexOf('|');
  if (pipeIdx === -1) {
    throw Object.assign(new Error('invalid_cursor'), { code: 'invalid_cursor' });
  }
  const startedAt = decoded.slice(0, pipeIdx);
  const runId = decoded.slice(pipeIdx + 1);
  if (!startedAt || !runId) {
    throw Object.assign(new Error('invalid_cursor'), { code: 'invalid_cursor' });
  }
  return { startedAt, runId };
}

function buildCursor(args: { startedAt: Date; runId: string }): string {
  return Buffer.from(`${args.startedAt.toISOString()}|${args.runId}`, 'utf8').toString('base64url');
}
