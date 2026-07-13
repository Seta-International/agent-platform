import { and, eq } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { account, projectAccess } from '../db/schema.ts';

/**
 * Scope infrastructure for other modules' RBAC row-scoping (e.g. hiring's AM scope,
 * people's allocation grid). Tenant-bound, no RBAC gate — the caller must already
 * have resolved its own permission.
 */
export async function listAccountIdsManagedBy(
  personId: string,
  tenantId: string,
): Promise<string[]> {
  const rows = await pmDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.tenant_id, tenantId), eq(account.am_person_id, personId)));
  return rows.map((r) => r.id);
}

export async function listProjectIdsOwnedBy(personId: string, tenantId: string): Promise<string[]> {
  const rows = await pmDb()
    .select({ id: projectAccess.project_id })
    .from(projectAccess)
    .where(
      and(
        eq(projectAccess.tenant_id, tenantId),
        eq(projectAccess.person_id, personId),
        eq(projectAccess.level, 'owner'),
      ),
    );
  return rows.map((r) => r.id);
}

export async function listAccountManagers(
  tenantId: string,
): Promise<{ account_id: string; am_person_id: string | null }[]> {
  return pmDb()
    .select({ account_id: account.id, am_person_id: account.am_person_id })
    .from(account)
    .where(eq(account.tenant_id, tenantId));
}
