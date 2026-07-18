/**
 * Shared vitest knobs for packages whose tests touch Postgres via
 * `withTestDb` (CREATE/DROP DATABASE per test file).
 *
 * History: the harness used to run with `fileParallelism: false` because
 * each per-test DB clone exhausted Postgres's default `max_connections=100`
 * when turbo fanned out packages concurrently — surfaced as cascading
 * `FATAL 57P01 admin_shutdown` errors.
 *
 * Current setup: `pg-container.ts` runs Postgres with `max_connections=400`
 * and `.withReuse()` so one shared container backs every package and every
 * `pnpm test` invocation. That headroom unlocks `fileParallelism: true`,
 * cutting per-package wall time roughly in half on a typical laptop.
 *
 * If you see `57P01` again, lower `maxWorkers` here OR bump max_connections
 * in `pg-container.ts` (and restart the reusable container).
 */
import { fileURLToPath } from 'node:url';

const setupDbTest = fileURLToPath(new URL('./setup-db-test.ts', import.meta.url));

// shared-config declares no vitest dependency of its own, so a `vitest/config`
// type import here binds to whichever vitest the workspace root happens to hoist
// (currently 4.1.10). Spreading a value carrying that exact version's `test` type
// into a consumer pinned to a different vitest (e.g. 4.1.9) makes the two
// `InlineConfig` instances collide (TS2769). Typing these knobs structurally keeps
// the value assignable to every vitest version's `test` config instead.
interface DbTestDefaults {
  pool: 'forks';
  fileParallelism: boolean;
  maxWorkers: number;
  testTimeout: number;
  hookTimeout: number;
  setupFiles: string[];
}

export const dbTestDefaults: DbTestDefaults = {
  pool: 'forks',
  fileParallelism: true,
  maxWorkers: 4,
  testTimeout: 60_000,
  hookTimeout: 120_000,
  setupFiles: [setupDbTest],
};
