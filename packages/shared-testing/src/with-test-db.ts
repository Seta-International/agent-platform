import { Pool } from 'pg';

export interface TestDbCtx {
  pool: Pool;
  databaseUrl: string;
}

// `DROP DATABASE WITH (FORCE)` sends pg_terminate_backend to every connection
// still attached to the target DB. Any pool we (or the consumer via initPools)
// haven't fully closed yet will surface that as `57P01 admin_shutdown` on its
// socket — which vitest treats as an unhandled-error and fails the suite even
// though every assertion passed. We caused those terminations, so swallow them.
function isExpectedAdminShutdown(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  return (err as { code?: unknown }).code === '57P01';
}

function attachExpectedShutdownHandler(pool: Pool): void {
  pool.on('error', (err) => {
    if (isExpectedAdminShutdown(err)) return;
    throw err;
  });
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
  attachExpectedShutdownHandler(testPool);

  try {
    return await fn({ pool: testPool, databaseUrl: url });
  } finally {
    await testPool.end().catch((err) => {
      if (!isExpectedAdminShutdown(err)) throw err;
    });

    const a = new Pool({ connectionString: adminUrl });
    attachExpectedShutdownHandler(a);
    try {
      await a.query(`DROP DATABASE ${name} WITH (FORCE)`);
    } finally {
      await a.end().catch((err) => {
        if (!isExpectedAdminShutdown(err)) throw err;
      });
    }
  }
}
