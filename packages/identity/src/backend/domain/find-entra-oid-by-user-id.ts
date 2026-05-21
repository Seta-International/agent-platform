import { and, eq, isNull } from 'drizzle-orm';
import { account, user } from '../../db/auth-tables.ts';
import { identityDb } from '../../db/index.ts';

/**
 * Translates a Seta user_id to the user's Entra Object ID.
 * Returns null when the user has no microsoft-entra-id account link or is deactivated.
 * Used by the pull-group job to reverse-translate local members for LWW comparison.
 */
export async function findEntraOidByUserId(input: {
  user_id: string;
  tenant_id: string;
}): Promise<string | null> {
  const db = identityDb();

  const [row] = await db
    .select({ entra_oid: account.account_id })
    .from(account)
    .innerJoin(user, eq(user.id, account.user_id))
    .where(
      and(
        eq(account.provider_id, 'microsoft-entra-id'),
        eq(account.user_id, input.user_id),
        eq(user.tenant_id, input.tenant_id),
        isNull(user.deactivated_at),
      ),
    )
    .limit(1);

  return row?.entra_oid ?? null;
}
