import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { type NodeTx, withTx } from './tx.ts';

export const TENANT_GUC = 'app.tenant_id';

const IDENT = /^[a-z_][a-z0-9_]*$/;

function assertIdent(name: string): void {
  if (!IDENT.test(name)) throw new Error(`unsafe SQL identifier: ${name}`);
}

/** DDL for module hand-written baseline migrations (PR1+). Policy is a backstop:
 *  the app still writes explicit WHERE tenant_id (spec §3.1). */
export function buildRlsSql(schema: string, tables: readonly string[]): string {
  assertIdent(schema);
  const guard = `NULLIF(current_setting('${TENANT_GUC}', true), '')::uuid`;
  return tables
    .map((table) => {
      assertIdent(table);
      return [
        `ALTER TABLE ${schema}.${table} ENABLE ROW LEVEL SECURITY;`,
        `ALTER TABLE ${schema}.${table} FORCE ROW LEVEL SECURITY;`,
        `CREATE POLICY tenant_isolation ON ${schema}.${table}`,
        `  USING (tenant_id = ${guard})`,
        `  WITH CHECK (tenant_id = ${guard});`,
      ].join('\n');
    })
    .join('\n');
}

export async function setTenantGuc(tx: NodeTx, tenantId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config(${TENANT_GUC}, ${tenantId}, true)`);
}

export async function withTenantTx<T>(
  db: NodePgDatabase<Record<string, unknown>>,
  tenantId: string,
  fn: (tx: NodeTx) => Promise<T>,
): Promise<T> {
  return withTx(db, async (tx) => {
    await setTenantGuc(tx, tenantId);
    return fn(tx);
  });
}
