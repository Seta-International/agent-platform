import type { Pool } from 'pg';

export type LifecyclePolicy =
  | { kind: 'permanent' }
  | { kind: 'ttl'; column: string; olderThan: string }
  | { kind: 'partition-drop'; olderThan: string }
  | { kind: 'custom'; run: (pool: Pool) => Promise<void> };

export interface LifecycleEntry {
  table: string;
  policy: LifecyclePolicy;
}

const QUALIFIED = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/;
const IDENT = /^[a-z_][a-z0-9_]*$/;
const INTERVAL = /^\d+ (days|hours|months)$/;

const registry: LifecycleEntry[] = [];

function validateLifecycleEntry(entry: LifecycleEntry): void {
  if (!QUALIFIED.test(entry.table)) {
    throw new Error(`lifecycle table must be schema.table, got: ${entry.table}`);
  }
  if ('column' in entry.policy && !IDENT.test(entry.policy.column)) {
    throw new Error(`unsafe column identifier: ${entry.policy.column}`);
  }
  if ('olderThan' in entry.policy && !INTERVAL.test(entry.policy.olderThan)) {
    throw new Error(`olderThan must look like '90 days', got: ${entry.policy.olderThan}`);
  }
}

export function registerLifecycle(entries: LifecycleEntry[]): void {
  for (const entry of entries) {
    validateLifecycleEntry(entry);
    if (registry.some((e) => e.table === entry.table)) {
      throw new Error(`lifecycle already registered for ${entry.table}`);
    }
    registry.push(entry);
  }
}

export function getLifecycleEntries(): readonly LifecycleEntry[] {
  return registry;
}

export function resetLifecycleRegistry(): void {
  registry.length = 0;
}

export interface RetentionOpts {
  batchSize?: number;
  log?: (msg: string, meta?: object) => void;
}

export async function runRetention(
  pool: Pool,
  entries: readonly LifecycleEntry[],
  opts?: RetentionOpts,
): Promise<void> {
  const batchSize = Math.max(1, opts?.batchSize ?? 5_000);
  const log = opts?.log ?? (() => {});
  for (const entry of entries) {
    validateLifecycleEntry(entry);
    const { table, policy } = entry;
    if (policy.kind === 'permanent') continue;
    if (policy.kind === 'custom') {
      await policy.run(pool);
      log('retention custom done', { table });
      continue;
    }
    if (policy.kind === 'ttl') {
      // ctid batching keeps each DELETE's lock/WAL footprint bounded
      let total = 0;
      for (;;) {
        const res = await pool.query(
          `DELETE FROM ${table} WHERE ctid IN (
             SELECT ctid FROM ${table}
              WHERE ${policy.column} < now() - $1::interval LIMIT $2)`,
          [policy.olderThan, batchSize],
        );
        total += res.rowCount ?? 0;
        if ((res.rowCount ?? 0) < batchSize) break;
      }
      log('retention ttl done', { table, deleted: total });
      continue;
    }
    // partition-drop: drop RANGE children whose upper bound is past the horizon
    const children = await pool.query<{ child: string; bound: string }>(
      `SELECT c.oid::regclass::text AS child, pg_get_expr(c.relpartbound, c.oid) AS bound
         FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = $1::regclass`,
      [table],
    );
    const horizon = await pool.query<{ h: string }>(`SELECT (now() - $1::interval)::text AS h`, [
      policy.olderThan,
    ]);
    const horizonMs = new Date(horizon.rows[0]?.h ?? '').getTime();
    // fail closed: an unknown horizon must never trigger a DROP
    if (Number.isNaN(horizonMs)) {
      log('retention partition skipped: bad horizon', { table });
      continue;
    }
    for (const { child, bound } of children.rows) {
      const to = /TO \('([^']+)'\)/.exec(bound)?.[1];
      if (!to) continue; // DEFAULT partition or unbounded — never drop
      const toMs = new Date(to).getTime();
      // fail closed: an unparseable bound must never trigger a DROP
      if (Number.isNaN(toMs)) {
        log('retention partition skipped: unparseable bound', { table, child });
        continue;
      }
      if (toMs >= horizonMs) continue;
      await pool.query(`ALTER TABLE ${table} DETACH PARTITION ${child}`);
      await pool.query(`DROP TABLE ${child}`);
      log('retention partition dropped', { table, child });
    }
  }
}
