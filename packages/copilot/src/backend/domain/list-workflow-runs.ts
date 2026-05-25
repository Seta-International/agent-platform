import { sql } from 'drizzle-orm';
import { copilotDb } from '../db/index.ts';
import type { SessionLike } from '../types.ts';

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
  workflowId?: string;
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

export type ApprovalDecisionKind = 'pending' | 'approved' | 'rejected' | 'superseded' | 'cancelled';

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
  // Most recent approval's status + reason. Null when the run has never
  // surfaced an approval (e.g. workflow has no HITL step).
  latestApprovalKind: ApprovalDecisionKind | null;
  latestApprovalReason: string | null;
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
  latest_approval_kind: string | null;
  latest_approval_reason: string | null;
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
      conditions.push(sql`r.tenant_id = ${tenantId}::uuid AND r.started_by = ${userId}::uuid`);
      break;
    case 'group':
    case 'tenant':
      conditions.push(sql`r.tenant_id = ${tenantId}::uuid`);
      break;
    case 'instance':
      break;
  }

  if (filters.status && filters.status.length > 0) {
    const statusList = filters.status as string[];
    const statusSql = statusList
      .map((s) => sql`${s}`)
      .reduce((acc, c, i) => (i === 0 ? c : sql`${acc}, ${c}`), sql``);
    conditions.push(sql`r.status = ANY(ARRAY[${statusSql}])`);
  }
  if (filters.startedVia && filters.startedVia.length > 0) {
    const viaList = filters.startedVia as string[];
    const viaSql = viaList
      .map((v) => sql`${v}`)
      .reduce((acc, c, i) => (i === 0 ? c : sql`${acc}, ${c}`), sql``);
    conditions.push(sql`r.started_via = ANY(ARRAY[${viaSql}])`);
  }
  if (filters.workflowId) {
    conditions.push(sql`r.workflow_id = ${filters.workflowId}`);
  }
  if (filters.dateFrom) {
    conditions.push(sql`r.started_at >= ${filters.dateFrom}::timestamptz`);
  }
  if (filters.dateTo) {
    conditions.push(sql`r.started_at <= ${filters.dateTo}::timestamptz`);
  }
  if (filters.search) {
    const like = `%${filters.search}%`;
    const prefix = `${filters.search}%`;
    conditions.push(
      sql`(r.run_id::text LIKE ${prefix} OR r.input_summary->>'taskTitle' ILIKE ${like})`,
    );
  }

  const cursor = opts.cursor ? parseCursor(opts.cursor) : null;
  if (cursor) {
    conditions.push(
      sql`(r.started_at, r.run_id) < (${new Date(cursor.startedAt)}::timestamptz, ${cursor.runId}::uuid)`,
    );
  }

  const db = copilotDb();
  const result = await db.execute(sql`
    SELECT r.run_id, r.workflow_id, r.tenant_id, r.started_by, r.started_via,
           r.status, r.suspend_reason, r.error_summary, r.input_summary,
           r.started_at, r.finished_at, r.duration_ms,
           latest.status AS latest_approval_kind,
           latest.decision_payload->>'reason' AS latest_approval_reason
      FROM copilot.workflow_runs AS r
      LEFT JOIN LATERAL (
        SELECT a.status, a.decision_payload
          FROM copilot.workflow_approvals AS a
         WHERE a.run_id = r.run_id
         ORDER BY a.created_at DESC
         LIMIT 1
      ) AS latest ON TRUE
      ${conditions.length === 0 ? sql`` : sql`WHERE ${conditions.reduce((acc, c, i) => (i === 0 ? c : sql`${acc} AND ${c}`), sql``)}`}
     ORDER BY r.started_at DESC, r.run_id DESC
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
        ? buildCursor({
            // biome-ignore lint/style/noNonNullAssertion: hasMore && last guarantees camelRows.length > 0
            startedAt: camelRows[camelRows.length - 1]!.startedAt,
            runId: last.run_id,
          })
        : null,
  };
}

const KNOWN_APPROVAL_KINDS = new Set<ApprovalDecisionKind>([
  'pending',
  'approved',
  'rejected',
  'superseded',
  'cancelled',
]);

function toCamel(r: RawRow): WorkflowRunRow {
  const rawKind = r.latest_approval_kind;
  const latestApprovalKind =
    rawKind != null && KNOWN_APPROVAL_KINDS.has(rawKind as ApprovalDecisionKind)
      ? (rawKind as ApprovalDecisionKind)
      : null;
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
    latestApprovalKind,
    latestApprovalReason: r.latest_approval_reason,
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
