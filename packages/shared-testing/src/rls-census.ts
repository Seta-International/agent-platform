import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';

export interface RlsCensusOpts {
  schema: string;
  tables: Record<string, unknown>;
  allowlist: readonly string[];
  appRole?: string;
}

export async function assertRlsCensus(pool: Pool, opts: RlsCensusOpts): Promise<void> {
  const appRole = opts.appRole ?? 'seta_app';
  const failures: string[] = [];
  const tenantTables: string[] = [];
  for (const value of Object.values(opts.tables)) {
    let cfg: ReturnType<typeof getTableConfig>;
    try {
      cfg = getTableConfig(value as PgTable);
    } catch {
      continue; // non-table export
    }
    if (!cfg.columns.some((c) => c.name === 'tenant_id')) continue;
    if (opts.allowlist.includes(cfg.name)) continue;
    tenantTables.push(cfg.name);
  }
  for (const table of tenantTables) {
    const sec = await pool.query<{ rls: boolean; forced: boolean }>(
      `SELECT relrowsecurity AS rls, relforcerowsecurity AS forced
         FROM pg_class WHERE oid = $1::regclass`,
      [`${opts.schema}.${table}`],
    );
    if (!sec.rows[0]?.rls || !sec.rows[0]?.forced) {
      failures.push(`${table}: RLS not enabled+forced`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query(`SET ROLE ${appRole}`);
      await client.query(`SELECT set_config('app.tenant_id', gen_random_uuid()::text, false)`);
      const rows = await client.query(`SELECT count(*)::int AS n FROM ${opts.schema}.${table}`);
      if (rows.rows[0]?.n !== 0)
        failures.push(`${table}: foreign tenant sees ${rows.rows[0]?.n} rows`);
      await client.query(`RESET ROLE`);
    } finally {
      client.release();
    }
  }
  if (failures.length > 0) throw new Error(`RLS census failed:\n${failures.join('\n')}`);
}
