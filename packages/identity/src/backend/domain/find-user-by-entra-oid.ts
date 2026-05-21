import { and, eq, isNull } from 'drizzle-orm';
import { account, user } from '../../db/auth-tables.ts';
import { identityDb } from '../../db/index.ts';

/**
 * Translates an Entra Object ID to a Seta user.
 * Queries the identity.account table where provider_id = 'microsoft-entra-id'
 * and account_id = entra_oid, then verifies the user belongs to the given tenant
 * and is not deactivated.
 */
export async function findUserByEntraOid(input: {
  entra_oid: string;
  tenant_id: string;
}): Promise<{ user_id: string; tenant_id: string } | null> {
  const db = identityDb();

  const [row] = await db
    .select({ user_id: user.id, tenant_id: user.tenant_id })
    .from(account)
    .innerJoin(user, eq(user.id, account.user_id))
    .where(
      and(
        eq(account.provider_id, 'microsoft-entra-id'),
        eq(account.account_id, input.entra_oid),
        eq(user.tenant_id, input.tenant_id),
        isNull(user.deactivated_at),
      ),
    )
    .limit(1);

  return row ?? null;
}
