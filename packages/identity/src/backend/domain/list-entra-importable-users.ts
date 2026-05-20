import { and, eq, inArray, sql } from 'drizzle-orm';
import { identityDb } from '../../db/index.ts';
import { user } from '../../db/schema.ts';
import { graphListUsers } from '../../sso/graph.ts';
import { requireProviderRow } from '../sso/helpers.ts';

export interface EntraImportableUser {
  entra_oid: string;
  email: string;
  display_name: string;
  account_enabled: boolean;
  already_in_seta: boolean;
}

export async function listEntraImportableUsers(
  tenantId: string,
): Promise<ReadonlyArray<EntraImportableUser>> {
  const provider = await requireProviderRow(tenantId, 'microsoft-entra-id');
  const graphUsers = await graphListUsers(provider.config.entra_tenant_id);

  const emails = graphUsers
    .map((g) => (g.mail ?? g.userPrincipalName ?? '').toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) return [];

  // Fetch all tenant users and intersect in JS to avoid ANY(array) cast issues with Drizzle
  const existing = await identityDb()
    .select({ email: user.email })
    .from(user)
    .where(and(eq(user.tenant_id, tenantId), inArray(sql`lower(${user.email})`, emails)));
  const existingSet = new Set(existing.map((r) => r.email.toLowerCase()));

  return graphUsers
    .filter((g) => Boolean(g.mail ?? g.userPrincipalName))
    .map((g) => {
      const rawEmail = g.mail ?? g.userPrincipalName ?? '';
      const email = rawEmail.toLowerCase();
      return {
        entra_oid: g.id,
        email,
        display_name: g.displayName ?? email,
        account_enabled: g.accountEnabled,
        already_in_seta: existingSet.has(email),
      };
    });
}
