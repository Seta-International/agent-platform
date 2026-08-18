// packages/planner/tests/fixtures/golden/action/db-snapshot.ts
//
// The SQL half of `dbEffects`: what the A2 tenants' rows looked like before a
// turn, and what changed across it.
//
// WHOLE-TENANT, not just the target row. BR-03 says "no row changed before
// Confirm" — a check that only looked at the task the case named would miss a
// preview that quietly wrote somewhere else, which is the failure the requirement
// exists for.
//
// Column names here are the TABLE's, not the model's. Two mappings matter to a
// case author: the model says `status: completed`, the column `progress` stores
// `'done'`; the model says `priority: urgent`, the column `priority` stores
// `'urgent'` (the 1/3/5/9 and 0/50/100 numbers are an API-level encoding and never
// reach a column). A comment's author is `author_id`, not `created_by`.
import type { Pool } from 'pg';
import type { ActionWorld } from './world.ts';

/** `"<table>:<row id>"` → the row's comparable columns. */
export type RowSnapshot = Map<string, Record<string, unknown>>;

export interface RowDiff {
  rowsChanged: number;
  changedKeys: string[];
}

/** One query per table, ordered so a snapshot is stable across runs. */
const QUERIES: { sql: string; key: (r: Record<string, unknown>) => string }[] = [
  {
    sql: `SELECT id, title, description, priority, progress, is_deferred,
                 start_at, due_at, bucket_id, deleted_at, version
            FROM planner.tasks WHERE tenant_id = $1 ORDER BY id`,
    key: (r) => `planner.tasks:${r.id}`,
  },
  {
    sql: `SELECT task_id, user_id, order_hint
            FROM planner.task_assignments WHERE tenant_id = $1 ORDER BY task_id, user_id`,
    key: (r) => `planner.task_assignments:${r.task_id}/${r.user_id}`,
  },
  {
    sql: `SELECT id, task_id, body, author_id
            FROM planner.task_comments WHERE tenant_id = $1 ORDER BY id`,
    key: (r) => `planner.task_comments:${r.id}`,
  },
  {
    sql: `SELECT id, task_id, url, alias, type, version
            FROM planner.task_references WHERE tenant_id = $1 ORDER BY id`,
    key: (r) => `planner.task_references:${r.id}`,
  },
];

export async function snapshotActionRows(pool: Pool, world: ActionWorld): Promise<RowSnapshot> {
  const snap: RowSnapshot = new Map();
  for (const tenantId of [world.tenantId, world.foreignTenantId]) {
    for (const q of QUERIES) {
      const rows = await pool.query<Record<string, unknown>>(q.sql, [tenantId]);
      for (const row of rows.rows) snap.set(q.key(row), row);
    }
  }
  return snap;
}

/** Normalised for comparison: a timestamptz becomes its ISO string, everything
 *  else its JSON form, so `Date` identity never masquerades as a change. */
function cell(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value ?? null);
}

export function diffActionRows(before: RowSnapshot, after: RowSnapshot): RowDiff {
  const changedKeys: string[] = [];
  for (const [key, row] of after) {
    const prev = before.get(key);
    if (!prev) {
      changedKeys.push(key);
      continue;
    }
    for (const column of Object.keys(row)) {
      if (cell(row[column]) !== cell(prev[column])) {
        changedKeys.push(key);
        break;
      }
    }
  }
  for (const key of before.keys()) if (!after.has(key)) changedKeys.push(key);
  changedKeys.sort();
  return { rowsChanged: changedKeys.length, changedKeys };
}

/**
 * Per-column assertions from a case's `dbEffects.after`.
 *
 * `'notNull'` and `null` are sentinels. A wanted value of 10 characters or fewer
 * against a timestamp column is compared as a DATE PREFIX (`2026-08-19` matches
 * `2026-08-19T02:00:00.000Z`), because the server applies the time of day and a
 * case must not have to know which one.
 */
export function checkAfter(
  snapshot: RowSnapshot,
  expectations: { table: string; id: string; [column: string]: unknown }[],
): string[] {
  const mismatches: string[] = [];
  for (const expectation of expectations) {
    const { table, id, ...columns } = expectation;
    const key = `${table}:${id}`;
    const row = snapshot.get(key);
    if (!row) {
      mismatches.push(`${key} not found`);
      continue;
    }
    for (const [column, want] of Object.entries(columns)) {
      const actual = row[column];
      if (want === 'notNull') {
        if (actual === null || actual === undefined) mismatches.push(`${key}.${column} is null`);
        continue;
      }
      if (want === null) {
        if (actual !== null && actual !== undefined) {
          mismatches.push(`${key}.${column} expected null, got ${cell(actual)}`);
        }
        continue;
      }
      const actualStr = actual instanceof Date ? actual.toISOString() : String(actual);
      const wantStr = String(want);
      const ok =
        wantStr.length <= 10 && actual instanceof Date
          ? actualStr.startsWith(wantStr)
          : actualStr === wantStr;
      if (!ok) mismatches.push(`${key}.${column} expected ${wantStr}, got ${actualStr}`);
    }
  }
  return mismatches;
}
