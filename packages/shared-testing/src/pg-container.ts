import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';

export interface PgContainerHandle {
  baseUrl: string;
  templateDbName: string;
  stop(): Promise<void>;
}

/**
 * Starts (or reuses) the shared Postgres container. With `.withReuse()`,
 * testcontainers hashes the builder config; an identical config returns
 * the existing container instead of starting a new one — so every package's
 * global-setup, and every successive `pnpm test` invocation, shares one
 * Postgres process. Set `TESTCONTAINERS_REUSE_ENABLE=false` to disable.
 */
export async function startPgContainer(opts?: { image?: string }): Promise<PgContainerHandle> {
  const image = opts?.image ?? 'pgvector/pgvector:pg17-trixie';
  const c: StartedPostgreSqlContainer = await new PostgreSqlContainer(image)
    .withUsername('seta')
    .withPassword('seta')
    // High max_connections so test files can run in parallel (vitest
    // fileParallelism: true) across multiple packages without exhausting backends.
    .withCommand(['postgres', '-c', 'max_connections=400'])
    .withReuse()
    .start();
  const fullUrl = c.getConnectionUri();
  const baseUrl = fullUrl.replace(/\/[^/]+$/, '');
  return {
    baseUrl,
    templateDbName: '',
    stop: async () => {
      // No-op when reuse is on: the container persists for the next run.
      // Ryuk reaps it after a window of inactivity, or stop manually via `docker stop`.
    },
  };
}

/**
 * Idempotently ensures `dbName` exists in the container. If it was previously
 * marked `datistemplate=true`, unmarks it so the caller can connect and run
 * (re-)migrations. Safe to call concurrently from multiple package global-setups
 * as long as each uses a different `dbName`.
 *
 * `recreate` drops it first. The container is reused across runs (`.withReuse()`), so a template
 * survives, and `runMigrations` skips what `__platform_migrations` already records — meaning
 * anything a migration does *conditionally*, on state that existed when it first ran, is frozen
 * forever. A caller that asserts against the migrated schema must build it from nothing, or it is
 * asserting against whatever the last checkout happened to leave behind.
 */
export async function ensureTemplateDb(
  handle: PgContainerHandle,
  dbName: string,
  opts?: { recreate?: boolean },
): Promise<void> {
  if (!/^[a-z][a-z0-9_]*$/.test(dbName)) {
    throw new Error(`ensureTemplateDb: unsafe dbName ${JSON.stringify(dbName)}`);
  }
  const admin = new Pool({ connectionString: `${handle.baseUrl}/postgres` });
  try {
    await admin.query(`UPDATE pg_database SET datistemplate=false WHERE datname=$1`, [dbName]);
    if (opts?.recreate) {
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    }
    const { rows } = await admin.query(`SELECT 1 FROM pg_database WHERE datname=$1`, [dbName]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE ${dbName}`);
    }
  } finally {
    await admin.end();
  }
}

export async function markAsTemplate(handle: PgContainerHandle, dbName: string): Promise<void> {
  const admin = new Pool({ connectionString: `${handle.baseUrl}/postgres` });
  try {
    await admin.query(`UPDATE pg_database SET datistemplate=true WHERE datname=$1`, [dbName]);
  } finally {
    await admin.end();
  }
  (handle as { templateDbName: string }).templateDbName = dbName;
}
