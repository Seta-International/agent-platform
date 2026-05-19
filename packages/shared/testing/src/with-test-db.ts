import { Pool } from 'pg';

export interface TestDbCtx {
  pool: Pool;
  databaseUrl: string;
}

export async function withTestDb<T>(
  opts: { templateDbName: string; baseUrl: string },
  fn: (ctx: TestDbCtx) => Promise<T>,
): Promise<T> {
  const name = `t_${crypto.randomUUID().replace(/-/g, '')}`;
  const adminUrl = `${opts.baseUrl}/postgres`;
  const admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query(`CREATE DATABASE ${name} TEMPLATE ${opts.templateDbName}`);
  } finally {
    await admin.end();
  }

  const url = `${opts.baseUrl}/${name}`;
  // Lazily call the consumer's initPools at use site. We don't import @seta/shared-db here
  // because that would create a circular workspace dependency (shared/db's tests need this).
  // The consumer wires the pool wherever needed; here we just give it a connection string.
  const testPool = new Pool({ connectionString: url });
  try {
    return await fn({ pool: testPool, databaseUrl: url });
  } finally {
    await testPool.end();
    const a = new Pool({ connectionString: adminUrl });
    try {
      await a.query(`DROP DATABASE ${name} WITH (FORCE)`);
    } finally {
      await a.end();
    }
  }
}
