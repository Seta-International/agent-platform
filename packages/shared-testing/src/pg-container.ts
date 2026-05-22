import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';

export interface PgContainerHandle {
  baseUrl: string;
  templateDbName: string;
  stop(): Promise<void>;
}

export async function startPgContainer(opts?: { image?: string }): Promise<PgContainerHandle> {
  const image = opts?.image ?? 'pgvector/pgvector:pg17-trixie';
  const c: StartedPostgreSqlContainer = await new PostgreSqlContainer(image)
    .withDatabase('seta_template')
    .withUsername('seta')
    .withPassword('seta')
    .start();
  const fullUrl = c.getConnectionUri();
  const baseUrl = fullUrl.replace(/\/[^/]+$/, '');
  return {
    baseUrl,
    templateDbName: '',
    stop: async () => {
      await c.stop();
    },
  };
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
