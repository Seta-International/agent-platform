import { sql } from 'drizzle-orm';
import { coreDb } from '../db/client.ts';

export interface AuditRow {
  event_id: string;
  occurred_at: string;
  event_type: string;
  actor: Record<string, unknown> | null;
  before: unknown;
  after: unknown;
  trace_id: string | null;
}

export interface AuditQueryOpts {
  tenant_id: string;
  event_type?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export async function queryAudit(
  opts: AuditQueryOpts,
): Promise<{ rows: AuditRow[]; total: number }> {
  const { tenant_id, event_type, from: fromTs, to: toTs, limit, offset } = opts;

  const rows = await coreDb().execute(sql`
    SELECT event_id, occurred_at, event_type, actor, before, after, trace_id
    FROM core.audit_v
    WHERE tenant_id = ${tenant_id}::uuid
      ${event_type ? sql`AND event_type = ${event_type}` : sql``}
      ${fromTs ? sql`AND occurred_at >= ${fromTs}::timestamptz` : sql``}
      ${toTs ? sql`AND occurred_at < ${toTs}::timestamptz` : sql``}
    ORDER BY occurred_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRes = await coreDb().execute(sql`
    SELECT count(*)::int AS n
    FROM core.audit_v
    WHERE tenant_id = ${tenant_id}::uuid
      ${event_type ? sql`AND event_type = ${event_type}` : sql``}
      ${fromTs ? sql`AND occurred_at >= ${fromTs}::timestamptz` : sql``}
      ${toTs ? sql`AND occurred_at < ${toTs}::timestamptz` : sql``}
  `);

  const total = (countRes.rows[0] as { n: number }).n;
  // drizzle execute() returns Record<string, unknown>[] — cast through unknown because
  // the shape is guaranteed by the SQL projection against core.audit_v.
  return { rows: rows.rows as unknown as AuditRow[], total };
}
