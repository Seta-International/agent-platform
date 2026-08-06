import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema/index.ts';
import { m365TenantConfig } from '../../db/schema/index.ts';

/**
 * The M365-enabled tenants the nightly directory cron fans out over (design §10).
 *
 * `enabled = false` is an admin switching the connector off, not a soft delete — the credentials
 * stay on the row, so filtering on it here is the only thing that stops the cron from re-acquiring
 * a token the admin deliberately retired.
 */
export async function listDirectoryTenantIds(db: NodePgDatabase<typeof schema>): Promise<string[]> {
  const rows = await db
    .select({ tenantId: m365TenantConfig.tenantId })
    .from(m365TenantConfig)
    .where(eq(m365TenantConfig.enabled, true))
    .orderBy(asc(m365TenantConfig.tenantId));
  return rows.map((row) => row.tenantId);
}
