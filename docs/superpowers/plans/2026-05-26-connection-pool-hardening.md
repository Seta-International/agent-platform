# Connection Pool Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OTEL pool instrumentation, harden pool config (timeouts + sizing), and standardize module client caching across `shared-db`, `copilot`, `planner`, and `identity`.

**Architecture:** New `instrumentation.ts` in `shared-db` registers observable gauges and wraps `pool.connect()` to record a wait-time histogram. `pools.ts` is hardened with safety timeouts, bumped worker max, and a `getPoolStats()` export. Three module DB clients are standardized to a cached factory pattern with test-reset helpers.

**Tech Stack:** `@opentelemetry/api` (already installed), `node-postgres` Pool, Drizzle ORM, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-26-connection-pool-hardening-design.md`

---

## File Map

| Action | File |
|---|---|
| **Create** | `packages/shared-db/src/instrumentation.ts` |
| **Create** | `packages/shared-db/tests/unit/instrumentation.test.ts` |
| **Modify** | `packages/shared-db/src/pools.ts` |
| **Modify** | `packages/shared-db/src/index.ts` |
| **Modify** | `packages/shared-db/tests/integration/pools.test.ts` |
| **Modify** | `packages/copilot/src/backend/db/index.ts` |
| **Modify** | `packages/copilot/src/testing/fixtures.ts` |
| **Modify** | `packages/planner/src/backend/db/index.ts` |
| **Modify** | `packages/planner/package.json` |
| **Create** | `packages/planner/src/testing/index.ts` |
| **Modify** | `packages/identity/src/backend/db/index.ts` |
| **Modify** | `packages/identity/src/testing/index.ts` |

---

## Task 1: OTEL Pool Instrumentation

**Files:**
- Create: `packages/shared-db/tests/unit/instrumentation.test.ts`
- Create: `packages/shared-db/src/instrumentation.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `packages/shared-db/tests/unit/instrumentation.test.ts`:

```ts
import { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// OTEL API is a no-op by default in tests — safe to import without SDK setup.
import { instrumentPool } from '../../src/instrumentation.ts';

function makeFakePool(): Pool {
  const fakeClient = { release: vi.fn() };
  const pool = {
    totalCount: 3,
    idleCount: 2,
    waitingCount: 0,
    connect: vi.fn().mockResolvedValue(fakeClient),
    on: vi.fn(),
  } as unknown as Pool;
  return pool;
}

describe('instrumentPool', () => {
  it('does not break pool.connect() — returns the client', async () => {
    const pool = makeFakePool();
    instrumentPool(pool, 'web');
    const client = await pool.connect();
    expect(client).toBeDefined();
    expect((client as { release: ReturnType<typeof vi.fn> }).release).toBeDefined();
  });

  it('calls the original connect exactly once per acquire', async () => {
    const pool = makeFakePool();
    const origConnect = pool.connect as ReturnType<typeof vi.fn>;
    instrumentPool(pool, 'web');
    await pool.connect();
    await pool.connect();
    expect(origConnect).toHaveBeenCalledTimes(2);
  });

  it('propagates connect() rejection without swallowing', async () => {
    const pool = makeFakePool();
    (pool.connect as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('timeout exceeded when trying to connect'),
    );
    instrumentPool(pool, 'web');
    await expect(pool.connect()).rejects.toThrow('timeout exceeded');
  });

  it('can instrument multiple pools with different names without error', () => {
    const web = makeFakePool();
    const worker = makeFakePool();
    expect(() => instrumentPool(web, 'web')).not.toThrow();
    expect(() => instrumentPool(worker, 'worker')).not.toThrow();
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd packages/shared-db && pnpm test --reporter=verbose 2>&1 | grep -E "FAIL|Cannot find|instrumentation"
```

Expected: `Cannot find module '../../src/instrumentation.ts'`

- [ ] **Step 1.3: Implement `instrumentation.ts`**

Create `packages/shared-db/src/instrumentation.ts`:

```ts
import { metrics } from '@opentelemetry/api';
import type { Pool, PoolClient } from 'pg';

const meter = metrics.getMeter('@seta/shared-db');

const totalGauge = meter.createObservableGauge('db_pool_connections_total', {
  unit: '{connection}',
  description: 'Total connections (checked-out + idle) in pool',
});
const idleGauge = meter.createObservableGauge('db_pool_connections_idle', {
  unit: '{connection}',
  description: 'Idle connections available for checkout',
});
const waitingGauge = meter.createObservableGauge('db_pool_connections_waiting', {
  unit: '{connection}',
  description: 'Client requests waiting for a free connection',
});
const waitHistogram = meter.createHistogram('db_pool_connection_wait_ms', {
  unit: 'ms',
  description: 'Time waiting for a connection to become available from the pool',
});

/**
 * Instruments a pg Pool with OTEL metrics.
 *
 * - Registers observable gauges for totalCount, idleCount, waitingCount (read at export time).
 * - Wraps pool.connect() to record a wait-time histogram on every acquire.
 *
 * Call once per pool immediately after initPools().
 * Only the Promise form of pool.connect() is supported (no callback overload).
 */
export function instrumentPool(pool: Pool, poolName: string): void {
  totalGauge.addCallback((result) => result.observe(pool.totalCount, { pool: poolName }));
  idleGauge.addCallback((result) => result.observe(pool.idleCount, { pool: poolName }));
  waitingGauge.addCallback((result) => result.observe(pool.waitingCount, { pool: poolName }));

  // Cast to the Promise-only overload. Callback usage does not exist in this codebase.
  const orig = pool.connect.bind(pool) as () => Promise<PoolClient>;
  (pool as unknown as { connect: () => Promise<PoolClient> }).connect = async () => {
    const start = performance.now();
    const client = await orig();
    waitHistogram.record(performance.now() - start, { pool: poolName });
    return client;
  };
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd packages/shared-db && pnpm test --reporter=verbose 2>&1 | grep -E "PASS|FAIL|instrumentation"
```

Expected: all `instrumentation` tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add packages/shared-db/src/instrumentation.ts packages/shared-db/tests/unit/instrumentation.test.ts
git commit -m "feat(shared-db): add OTEL pool instrumentation"
```

---

## Task 2: Pool Hardening

**Files:**
- Modify: `packages/shared-db/src/pools.ts`
- Modify: `packages/shared-db/src/index.ts`
- Modify: `packages/shared-db/tests/integration/pools.test.ts`

- [ ] **Step 2.1: Update the failing assertions first**

Open `packages/shared-db/tests/integration/pools.test.ts`. The existing test asserts `worker.options.max === 10` — update it to 20 and add new assertions for timeouts and `getPoolStats()`. Replace the entire file content:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { closePools, getPool, getPoolStats, initPools } from '../../src/index.ts';

beforeEach(async () => {
  try {
    await closePools();
  } catch {
    // pools may not be initialized; closePools is idempotent
  }
});

describe('pools', () => {
  it('initPools returns three named pools at the configured sizes', () => {
    const pools = initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    expect(pools.web.options.max).toBe(15);
    expect(pools.worker.options.max).toBe(20);
    expect(pools.mastraState.options.max).toBe(5);
  });

  it('initPools sets safety timeouts on all pools', () => {
    const pools = initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    expect(pools.web.options.connectionTimeoutMillis).toBe(5_000);
    expect(pools.worker.options.connectionTimeoutMillis).toBe(10_000);
    expect(pools.mastraState.options.connectionTimeoutMillis).toBe(5_000);
    expect(pools.web.options.idleTimeoutMillis).toBe(10_000);
    expect(pools.worker.options.idleTimeoutMillis).toBe(30_000);
    expect(pools.mastraState.options.idleTimeoutMillis).toBe(10_000);
  });

  it('initPools throws if called twice without closePools', () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    expect(() => initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' })).toThrow(
      /already initialized/i,
    );
  });

  it('getPool returns the named pool', () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    expect(getPool('web').options.max).toBe(15);
    expect(getPool('worker').options.max).toBe(20);
    expect(getPool('mastraState').options.max).toBe(5);
  });

  it('getPool throws if pools not initialized', async () => {
    await closePools();
    expect(() => getPool('web')).toThrow(/initPools/i);
  });

  it('overrides for max sizes are honored', () => {
    const pools = initPools({
      databaseUrl: 'postgres://x:y@127.0.0.1:1/none',
      webMax: 5,
      workerMax: 8,
      mastraStateMax: 2,
    });
    expect(pools.web.options.max).toBe(5);
    expect(pools.worker.options.max).toBe(8);
    expect(pools.mastraState.options.max).toBe(2);
  });

  it('getPoolStats returns shape with total/idle/waiting per pool', () => {
    initPools({ databaseUrl: 'postgres://x:y@127.0.0.1:1/none' });
    const stats = getPoolStats();
    expect(stats).not.toBeNull();
    expect(stats).toMatchObject({
      web:         { total: expect.any(Number), idle: expect.any(Number), waiting: expect.any(Number) },
      worker:      { total: expect.any(Number), idle: expect.any(Number), waiting: expect.any(Number) },
      mastraState: { total: expect.any(Number), idle: expect.any(Number), waiting: expect.any(Number) },
    });
  });

  it('getPoolStats returns null when pools not initialized', async () => {
    await closePools();
    expect(getPoolStats()).toBeNull();
  });
});
```

- [ ] **Step 2.2: Run tests to verify the new assertions fail**

```bash
cd packages/shared-db && pnpm test --reporter=verbose 2>&1 | grep -E "FAIL|getPoolStats|worker.*20|timeout"
```

Expected: failures on `worker.options.max === 20`, timeout assertions, and `getPoolStats`.

- [ ] **Step 2.3: Update `pools.ts`**

Replace the contents of `packages/shared-db/src/pools.ts` with:

```ts
import { Pool } from 'pg';
import { instrumentPool } from './instrumentation.ts';

export interface PoolsConfig {
  databaseUrl: string;
  webMax?: number;
  workerMax?: number;
  mastraStateMax?: number;
  statementTimeoutMs?: number;
}

export interface Pools {
  web: Pool;
  worker: Pool;
  mastraState: Pool;
}

let pools: Pools | null = null;

// Sizing formula (docs/hosting/aws.md §7):
//   max = floor(pg_max_connections / (server_tasks + worker_tasks)) − margin
//   Starter  (200 / 2 tasks) − 10 = ~90 headroom
//   Growth   (400 / 6 tasks) − 10 = ~57 headroom
//   Scale tier: introduce RDS Proxy instead of raising pool sizes further.
//   Override via cfg.webMax / cfg.workerMax / cfg.mastraStateMax.
export function initPools(cfg: PoolsConfig): Pools {
  if (pools) throw new Error('Pools already initialized; call closePools() first.');
  const webStmt = cfg.statementTimeoutMs ?? 5_000;
  const workerStmt = 30_000;
  pools = {
    web: new Pool({
      connectionString: cfg.databaseUrl,
      max: cfg.webMax ?? 15,
      min: 2,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      statement_timeout: webStmt,
    }),
    worker: new Pool({
      connectionString: cfg.databaseUrl,
      max: cfg.workerMax ?? 20,
      min: 2,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: workerStmt,
    }),
    mastraState: new Pool({
      connectionString: cfg.databaseUrl,
      max: cfg.mastraStateMax ?? 5,
      min: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      statement_timeout: webStmt,
    }),
  };
  // Idle clients can emit 'error' if the server terminates them out from under us (admin
  // shutdown, DROP DATABASE WITH FORCE in tests). Without a Pool-level handler, those
  // become unhandled rejections and crash the process. We surface them via console.warn
  // so genuine pool problems still show up but don't kill the runner.
  const swallow = (e: unknown) => {
    console.warn('[shared-db] pg pool client error (suppressed):', e);
  };
  pools.web.on('error', swallow);
  pools.worker.on('error', swallow);
  pools.mastraState.on('error', swallow);

  instrumentPool(pools.web, 'web');
  instrumentPool(pools.worker, 'worker');
  instrumentPool(pools.mastraState, 'mastraState');

  return pools;
}

export function getPool(name: 'web' | 'worker' | 'mastraState'): Pool {
  if (!pools) throw new Error('getPool called before initPools.');
  return pools[name];
}

export function getPoolStats(): {
  web: { total: number; idle: number; waiting: number };
  worker: { total: number; idle: number; waiting: number };
  mastraState: { total: number; idle: number; waiting: number };
} | null {
  if (!pools) return null;
  return {
    web:         { total: pools.web.totalCount,         idle: pools.web.idleCount,         waiting: pools.web.waitingCount },
    worker:      { total: pools.worker.totalCount,      idle: pools.worker.idleCount,      waiting: pools.worker.waitingCount },
    mastraState: { total: pools.mastraState.totalCount, idle: pools.mastraState.idleCount, waiting: pools.mastraState.waitingCount },
  };
}

export async function closePools(): Promise<void> {
  if (!pools) return;
  await Promise.all([pools.web.end(), pools.worker.end(), pools.mastraState.end()]);
  pools = null;
}
```

- [ ] **Step 2.4: Export `getPoolStats` from `index.ts`**

In `packages/shared-db/src/index.ts`, update the pools export line:

```ts
// Old:
export { closePools, getPool, initPools, type Pools, type PoolsConfig } from './pools.ts';

// New:
export { closePools, getPool, getPoolStats, initPools, type Pools, type PoolsConfig } from './pools.ts';
```

- [ ] **Step 2.5: Run tests to verify they pass**

```bash
cd packages/shared-db && pnpm test --reporter=verbose
```

Expected: all tests pass, including the new timeout and `getPoolStats` assertions.

- [ ] **Step 2.6: Commit**

```bash
git add packages/shared-db/src/pools.ts packages/shared-db/src/index.ts packages/shared-db/tests/integration/pools.test.ts
git commit -m "feat(shared-db): harden pool config — timeouts, worker max=20, getPoolStats"
```

---

## Task 3: Module Client Caching — `copilot`

**Files:**
- Modify: `packages/copilot/src/backend/db/index.ts`
- Modify: `packages/copilot/src/testing/fixtures.ts`

- [ ] **Step 3.1: Write the failing unit test**

Create `packages/copilot/tests/unit/db.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock shared-db so no real Pool is needed
vi.mock('@seta/shared-db', () => ({
  getPool: vi.fn(() => ({ connect: vi.fn(), on: vi.fn() })),
}));

// Mock drizzle so it returns a stable object per call
const mockDrizzleInstance = { _tag: 'drizzle' };
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => mockDrizzleInstance),
}));

describe('copilotDb caching', () => {
  beforeEach(async () => {
    // Reset module registry so cached let variable is cleared between tests
    const { resetCopilotDb } = await import('../../src/backend/db/index.ts');
    resetCopilotDb();
  });

  it('returns the same instance on repeated calls', async () => {
    const { copilotDb } = await import('../../src/backend/db/index.ts');
    const a = copilotDb();
    const b = copilotDb();
    expect(a).toBe(b);
  });

  it('resetCopilotDb clears the cache — next call returns a new instance', async () => {
    const { copilotDb, resetCopilotDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const a = copilotDb();
    resetCopilotDb();
    const b = copilotDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
    // Both are the mock instance but drizzle was called twice — cache was cleared
    expect(a).toBe(b); // same mock object, but drizzle() called again
  });
});
```

- [ ] **Step 3.2: Run to verify it fails**

```bash
cd packages/copilot && pnpm test --reporter=verbose 2>&1 | grep -E "FAIL|resetCopilotDb|cannot find"
```

Expected: `resetCopilotDb is not a function` or similar.

- [ ] **Step 3.3: Update `packages/copilot/src/backend/db/index.ts`**

```ts
import { getPool, type NodePgDatabase } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function copilotDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = drizzle(getPool('worker'), { schema });
  return cached;
}

/** Reset the cached instance. Use only in tests via @seta/copilot/testing. */
export function resetCopilotDb(): void {
  cached = null;
}

export type CopilotDb = ReturnType<typeof copilotDb>;
export * as copilotSchema from './schema.ts';
```

- [ ] **Step 3.4: Export `resetCopilotDb` from `packages/copilot/src/testing/fixtures.ts`**

Add to the bottom of the file:

```ts
export { resetCopilotDb } from '../backend/db/index.ts';
```

- [ ] **Step 3.5: Run tests to verify they pass**

```bash
cd packages/copilot && pnpm test --reporter=verbose 2>&1 | grep -E "PASS|FAIL|db.test"
```

Expected: `db.test.ts` passes.

- [ ] **Step 3.6: Commit**

```bash
git add packages/copilot/src/backend/db/index.ts packages/copilot/src/testing/fixtures.ts packages/copilot/tests/unit/db.test.ts
git commit -m "feat(copilot): standardize copilotDb() to cached factory pattern"
```

---

## Task 4: Module Client Caching — `planner`

**Files:**
- Modify: `packages/planner/src/backend/db/index.ts`
- Modify: `packages/planner/package.json`
- Create: `packages/planner/src/testing/index.ts`

- [ ] **Step 4.1: Write the failing unit test**

Create `packages/planner/tests/unit/db.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@seta/shared-db', () => ({
  getPool: vi.fn(() => ({ connect: vi.fn(), on: vi.fn() })),
}));

const mockDrizzleInstance = { _tag: 'drizzle' };
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => mockDrizzleInstance),
}));

describe('plannerDb caching', () => {
  beforeEach(async () => {
    const { resetPlannerDb } = await import('../../src/backend/db/index.ts');
    resetPlannerDb();
  });

  it('returns the same instance on repeated calls', async () => {
    const { plannerDb } = await import('../../src/backend/db/index.ts');
    expect(plannerDb()).toBe(plannerDb());
  });

  it('resetPlannerDb clears the cache', async () => {
    const { plannerDb, resetPlannerDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    plannerDb();
    resetPlannerDb();
    plannerDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4.2: Run to verify it fails**

```bash
cd packages/planner && pnpm test --reporter=verbose 2>&1 | grep -E "FAIL|resetPlannerDb"
```

Expected: `resetPlannerDb is not a function`.

- [ ] **Step 4.3: Update `packages/planner/src/backend/db/index.ts`**

```ts
import { getPool, type NodePgDatabase } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

export * from './schema.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function plannerDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = drizzle(getPool('worker'), { schema });
  return cached;
}

/** Reset the cached instance. Use only in tests via @seta/planner/testing. */
export function resetPlannerDb(): void {
  cached = null;
}

export type PlannerDb = ReturnType<typeof plannerDb>;
```

- [ ] **Step 4.4: Create `packages/planner/src/testing/index.ts`**

```ts
// Test-only surface. Production code must never import from this subpath.
export { resetPlannerDb } from '../backend/db/index.ts';
```

- [ ] **Step 4.5: Add `/testing` subpath to `packages/planner/package.json`**

In the `"exports"` object, add:

```json
"./testing": "./src/testing/index.ts"
```

The exports block should look like:

```json
"exports": {
  ".": "./src/index.ts",
  "./agent-tools": "./src/agent-tools.ts",
  "./register": "./src/register.ts",
  "./agent-tools/register": {
    "types": "./src/backend/agent-tools/register.ts",
    "default": "./src/backend/agent-tools/register.ts"
  },
  "./events": "./src/events/index.ts",
  "./http": "./src/backend/http/index.ts",
  "./stream": "./src/backend/stream/index.ts",
  "./testing": "./src/testing/index.ts"
},
```

- [ ] **Step 4.6: Run tests to verify they pass**

```bash
cd packages/planner && pnpm test --reporter=verbose 2>&1 | grep -E "PASS|FAIL|db.test"
```

Expected: passes.

- [ ] **Step 4.7: Commit**

```bash
git add packages/planner/src/backend/db/index.ts packages/planner/src/testing/index.ts packages/planner/package.json packages/planner/tests/unit/db.test.ts
git commit -m "feat(planner): standardize plannerDb() to cached factory, add /testing subpath"
```

---

## Task 5: Module Client Caching — `identity`

**Files:**
- Modify: `packages/identity/src/backend/db/index.ts`
- Modify: `packages/identity/src/testing/index.ts`

- [ ] **Step 5.1: Write the failing unit test**

Create `packages/identity/tests/unit/db.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@seta/shared-db', () => ({
  getPool: vi.fn(() => ({ connect: vi.fn(), on: vi.fn() })),
}));

const mockDrizzleInstance = { _tag: 'drizzle' };
vi.mock('drizzle-orm/node-postgres', () => ({
  drizzle: vi.fn(() => mockDrizzleInstance),
}));

describe('identityDb caching', () => {
  beforeEach(async () => {
    const { resetIdentityDb } = await import('../../src/backend/db/index.ts');
    resetIdentityDb();
  });

  it('returns the same instance on repeated calls', async () => {
    const { identityDb } = await import('../../src/backend/db/index.ts');
    expect(identityDb()).toBe(identityDb());
  });

  it('resetIdentityDb clears the cache', async () => {
    const { identityDb, resetIdentityDb } = await import('../../src/backend/db/index.ts');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    identityDb();
    resetIdentityDb();
    identityDb();
    expect(drizzle).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 5.2: Run to verify it fails**

```bash
cd packages/identity && pnpm test --reporter=verbose 2>&1 | grep -E "FAIL|resetIdentityDb"
```

- [ ] **Step 5.3: Update `packages/identity/src/backend/db/index.ts`**

```ts
import { getPool, type NodePgDatabase } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

let cached: NodePgDatabase<typeof schema> | null = null;

export function identityDb(): NodePgDatabase<typeof schema> {
  if (!cached) cached = drizzle(getPool('worker'), { schema });
  return cached;
}

/** Reset the cached instance. Use only in tests via @seta/identity/testing. */
export function resetIdentityDb(): void {
  cached = null;
}

export type IdentityDb = ReturnType<typeof identityDb>;
export * as identitySchema from './schema.ts';
```

- [ ] **Step 5.4: Export `resetIdentityDb` from `packages/identity/src/testing/index.ts`**

Add to the bottom of the existing file:

```ts
export { resetIdentityDb } from '../backend/db/index.ts';
```

- [ ] **Step 5.5: Run tests to verify they pass**

```bash
cd packages/identity && pnpm test --reporter=verbose 2>&1 | grep -E "PASS|FAIL|db.test"
```

- [ ] **Step 5.6: Commit**

```bash
git add packages/identity/src/backend/db/index.ts packages/identity/src/testing/index.ts packages/identity/tests/unit/db.test.ts
git commit -m "feat(identity): standardize identityDb() to cached factory"
```

---

## Task 6: Final Verification

- [ ] **Step 6.1: Full typecheck**

```bash
cd /Users/canh/Projects/Seta/agent-platform && pnpm typecheck 2>&1 | tail -20
```

Expected: no errors. If errors appear in `identity/src/backend/auth.ts` (it calls `getPool` and `initPools` directly for legacy reasons), those are pre-existing and out of scope.

- [ ] **Step 6.2: Full lint**

```bash
pnpm lint 2>&1 | grep -E "error|warning" | head -20
```

Expected: no new errors.

- [ ] **Step 6.3: Run all affected package tests**

```bash
pnpm --filter @seta/shared-db test && pnpm --filter @seta/copilot test && pnpm --filter @seta/planner test && pnpm --filter @seta/identity test
```

Expected: all pass.

- [ ] **Step 6.4: Final commit (if any straggler files)**

```bash
git status
# If clean, nothing to do. If any files changed, commit:
git add -A && git commit -m "chore: connection pool hardening — final verification pass"
```
