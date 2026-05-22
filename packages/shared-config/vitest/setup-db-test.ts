/**
 * Worker-level safety net: swallow `57P01 admin_shutdown` errors that bubble
 * up from pg connections we didn't own.
 *
 * `withTestDb` issues `DROP DATABASE WITH (FORCE)` on teardown, which sends
 * `pg_terminate_backend` to every connection on the test DB. Pools created by
 * `initPools` already attach error handlers that swallow this — but tests that
 * also spin up third-party clients (e.g. Mastra storage backed by pg) can leak
 * a connection that vitest then treats as an unhandled rejection.
 *
 * Filtering at the worker level keeps the suite green without papering over
 * genuine errors: anything that isn't `57P01` propagates as usual.
 */
function is57P01(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  return (value as { code?: unknown }).code === '57P01';
}

process.on('unhandledRejection', (reason) => {
  if (is57P01(reason)) return;
  throw reason;
});

process.on('uncaughtException', (err) => {
  if (is57P01(err)) return;
  throw err;
});
