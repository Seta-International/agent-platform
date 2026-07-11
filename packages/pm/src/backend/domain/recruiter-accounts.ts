import { and, eq } from 'drizzle-orm';
import { pmDb } from '../db/client.ts';
import { accountRecruiter } from '../db/schema.ts';

/**
 * Scope infrastructure for other modules' RBAC row-scoping (e.g. hiring's recruiter scope).
 * Tenant-bound, no RBAC gate — the caller must already have resolved its own permission.
 */
export async function listRecruiterAccountIds(
  workerId: string,
  tenantId: string,
): Promise<string[]> {
  const rows = await pmDb()
    .select({ account_id: accountRecruiter.account_id })
    .from(accountRecruiter)
    .where(
      and(
        eq(accountRecruiter.tenant_id, tenantId),
        eq(accountRecruiter.recruiter_person_id, workerId),
      ),
    );
  return rows.map((r) => r.account_id);
}
