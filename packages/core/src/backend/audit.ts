import { sql } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';

export interface AuditRow {
  event_id: string;
  occurred_at: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  before: unknown;
  after: unknown;
  trace_id: string | null;
}

export type AuditSortBy = 'occurred_at' | 'event_type';
export type AuditSortDir = 'asc' | 'desc';

export interface AuditQueryOpts {
  tenant_id: string;
  event_type?: string;
  aggregate_id?: string;
  /** When set, restricts results to events whose aggregate_id is in this list. Combined with
   *  aggregate_id (single) via AND when both are provided. */
  aggregate_ids?: ReadonlyArray<string>;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
  sort_by?: AuditSortBy;
  sort_dir?: AuditSortDir;
}

export async function queryAudit(
  opts: AuditQueryOpts,
): Promise<{ rows: AuditRow[]; total: number }> {
  const {
    tenant_id,
    event_type,
    aggregate_id,
    aggregate_ids,
    from: fromTs,
    to: toTs,
    limit,
    offset,
    sort_by = 'occurred_at',
    sort_dir = 'desc',
  } = opts;

  if (aggregate_ids !== undefined && aggregate_ids.length === 0) {
    return { rows: [], total: 0 };
  }
  // Why inline literal: drizzle's `sql\`${array}\`` expands a JS array as comma-separated
  // parameters (tuple form), which the `::text[]` cast then rejects. Building a SQL ARRAY
  // literal sends zero parameters for this clause. Safe because every id is validated as
  // a UUID — no SQL injection surface.
  const aggregateIdsFilter =
    aggregate_ids && aggregate_ids.length > 0
      ? (() => {
          const validated = aggregate_ids.filter((id) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
          );
          if (validated.length === 0) return sql`AND FALSE`;
          const literal = `ARRAY[${validated.map((id) => `'${id}'`).join(',')}]::text[]`;
          return sql`AND aggregate_id = ANY(${sql.raw(literal)})`;
        })()
      : sql``;

  const orderBy =
    sort_by === 'event_type'
      ? sort_dir === 'asc'
        ? sql`ORDER BY event_type ASC, occurred_at DESC`
        : sql`ORDER BY event_type DESC, occurred_at DESC`
      : sort_dir === 'asc'
        ? sql`ORDER BY occurred_at ASC`
        : sql`ORDER BY occurred_at DESC`;

  const rows = await coreDb().execute(sql`
    SELECT event_id, occurred_at, event_type, aggregate_type, aggregate_id, actor, payload, before, after, trace_id
    FROM core.audit_v
    WHERE tenant_id = ${tenant_id}::uuid
      ${event_type ? sql`AND event_type = ${event_type}` : sql``}
      ${aggregate_id ? sql`AND aggregate_id = ${aggregate_id}` : sql``}
      ${aggregateIdsFilter}
      ${fromTs ? sql`AND occurred_at >= ${fromTs}::timestamptz` : sql``}
      ${toTs ? sql`AND occurred_at < ${toTs}::timestamptz` : sql``}
    ${orderBy}
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRes = await coreDb().execute(sql`
    SELECT count(*)::int AS n
    FROM core.audit_v
    WHERE tenant_id = ${tenant_id}::uuid
      ${event_type ? sql`AND event_type = ${event_type}` : sql``}
      ${aggregate_id ? sql`AND aggregate_id = ${aggregate_id}` : sql``}
      ${aggregateIdsFilter}
      ${fromTs ? sql`AND occurred_at >= ${fromTs}::timestamptz` : sql``}
      ${toTs ? sql`AND occurred_at < ${toTs}::timestamptz` : sql``}
  `);

  const total = (countRes.rows[0] as { n: number }).n;
  // drizzle execute() returns Record<string, unknown>[] — cast through unknown because
  // the shape is guaranteed by the SQL projection against core.audit_v.
  return { rows: rows.rows as unknown as AuditRow[], total };
}
