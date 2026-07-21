// packages/planner/tests/fixtures/golden/oracles/with-golden-lock.ts
//
// Exclusive golden-pipeline lock (spec §H). The golden dataset lives in a
// shared tenant; reset→seed→embed→preflight→eval must run as one atomic unit or
// a concurrent run will see a half-seeded DB. The runner MUST wrap the WHOLE
// pipeline in `withGoldenLock`, not just the eval step.
//
// Implemented with a Postgres session-level advisory lock. The lock and unlock
// must run on the SAME backend connection, so we check out a dedicated client
// from the pool rather than using `pool.query` (which may pick a different
// pooled connection per call).
//
// CI alternative: a `concurrency:` group on the workflow keyed to the shared DB
// achieves the same serialization at the job level; the advisory lock is the
// in-process guard for local/testcontainer runs.
import type { Pool } from 'pg';

/** Arbitrary but fixed 64-bit key identifying the golden pipeline lock. */
export const GOLDEN_LOCK_KEY = 626_626_626;

export async function withGoldenLock<T>(pool: Pool, fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [GOLDEN_LOCK_KEY]);
    return await fn();
  } finally {
    // Best-effort release; the session lock is also dropped when the connection
    // closes, so a failed unlock cannot leak the lock past connection teardown.
    await client.query('SELECT pg_advisory_unlock($1)', [GOLDEN_LOCK_KEY]).catch(() => {});
    client.release();
  }
}
