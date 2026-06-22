import { eq } from 'drizzle-orm';
import { coreDb } from './client.ts';
import { coreTenants } from './schema/tenants.ts';

export async function getTenantEmailDomains(tenantId: string): Promise<string[]> {
  const [row] = await coreDb()
    .select({ email_domains: coreTenants.email_domains })
    .from(coreTenants)
    .where(eq(coreTenants.id, tenantId))
    .limit(1);
  return row?.email_domains ?? [];
}
