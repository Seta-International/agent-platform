/**
 * Worker-level safety net: swallow teardown-race errors that bubble up from
 * pg connections (or pg-backed third-party clients) we didn't own.
 *
 * Two error shapes are filtered:
 *
 *  - `57P01 admin_shutdown` — `withTestDb` issues `DROP DATABASE WITH (FORCE)`
 *    on teardown, which sends `pg_terminate_backend` to every connection on the
 *    test DB. Pools created by `initPools` already attach error handlers that
 *    swallow this; tests that spin up third-party pg clients can leak a
 *    connection that vitest then treats as an unhandled rejection.
 *
 *  - `Cannot use a pool after calling end on the pool` — Mastra's pg-backed
 *    storage lazy-initializes its tables on first use. If a test ends and
 *    closes its pool before Mastra finishes that init, the in-flight init
 *    fails with this message. The actual test work has already succeeded; the
 *    error surfaces in worker teardown.
 *
 * Filtering at the worker level keeps the suite green without papering over
 * genuine errors: anything that isn't a teardown race propagates as usual.
 */
function is57P01(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return (value as { code?: unknown }).code === '57P01';
}

function isPoolAfterEnd(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const msg = (value as { message?: unknown }).message;
  if (typeof msg === 'string' && msg.includes('Cannot use a pool after calling end on the pool')) {
    return true;
  }
  const cause = (value as { cause?: unknown }).cause;
  return cause !== undefined && isPoolAfterEnd(cause);
}

function isTeardownRace(value: unknown): boolean {
  return is57P01(value) || isPoolAfterEnd(value);
}

process.on('unhandledRejection', (reason) => {
  if (isTeardownRace(reason)) return;
  throw reason;
});

process.on('uncaughtException', (err) => {
  if (isTeardownRace(err)) return;
  throw err;
});
