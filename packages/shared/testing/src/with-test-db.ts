import { closePools, getPool, initPools } from '@seta/shared-db';
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
  initPools({ databaseUrl: url });
  try {
    return await fn({ pool: getPool('web'), databaseUrl: url });
  } finally {
    await closePools();
    const a = new Pool({ connectionString: adminUrl });
    try {
      await a.query(`DROP DATABASE ${name} WITH (FORCE)`);
    } finally {
      await a.end();
    }
  }
}
