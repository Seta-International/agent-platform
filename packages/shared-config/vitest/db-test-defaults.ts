/**
 * Shared vitest knobs for packages whose tests touch Postgres via
 * `withTestDb` (CREATE/DROP DATABASE per test file).
 *
 * The current harness is connection-heavy: every test file spins up a
 * fresh DB from a template and force-drops it on teardown. With turbo
 * fanning out N packages × vitest's default `maxWorkers = 50% of CPUs`,
 * the local Postgres instance hits `max_connections` and starts killing
 * backends with `FATAL 57P01 admin_shutdown`, which surfaces as a
 * cascade of unrelated test failures.
 *
 * `fileParallelism: false` keeps each package's vitest run linear; the
 * cross-package fan-out is then capped by `concurrency` in `turbo.json`.
 * `maxWorkers` is a belt-and-braces guard for anyone who flips
 * `fileParallelism` back on locally. When the harness moves to a
 * tx-per-test model these caps can be relaxed in one place.
 */
import { fileURLToPath } from 'node:url';
import type { ViteUserConfig } from 'vitest/config';

const setupDbTest = fileURLToPath(new URL('./setup-db-test.ts', import.meta.url));

export const dbTestDefaults: NonNullable<ViteUserConfig['test']> = {
  pool: 'forks',
  fileParallelism: false,
  maxWorkers: 2,
  testTimeout: 60_000,
  hookTimeout: 120_000,
  setupFiles: [setupDbTest],
};
