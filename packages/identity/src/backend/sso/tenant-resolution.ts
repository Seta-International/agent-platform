import { and, eq, sql } from 'drizzle-orm';
import pino from 'pino';
import { identityAuthDb } from '../db/index.ts';
import { tenantSsoProviders, user } from '../db/schema.ts';
import type { SsoProviderId } from './config.ts';

const log = pino({ name: 'identity/sso/tenant-resolution' });

export interface ResolvedSetaTenant {
  tenant_id: string;
  provider_id: SsoProviderId;
  // Projected in from integrations; null until the tenant's M365 config has been set.
  entra_tenant_id: string | null;
}

// Reject-on-ambiguity guard: `core.tenants.email_domains` cross-tenant uniqueness and
// `identity.user.email` per-tenant-only uniqueness are both enforced at write time, but
// neither is airtight against every race (see setTenantEmailDomains). If two different
// tenants ever end up matching the same email/domain, picking one via LIMIT 1 could route
// an SSO login into the wrong tenant — so instead of guessing, treat >1 distinct tenant_id
// as unresolvable and fail closed (distinct from a genuine no-match, which the caller
// should still fall through to its next resolution strategy for). A single tenant matched
// via multiple rows (e.g. more than one enabled provider row) is not ambiguous.
type PickResult<T> =
  | { status: 'found'; row: T }
  | { status: 'not_found' }
  | { status: 'ambiguous' };

function pickUnambiguous<T extends { tenant_id: string }>(
  rows: T[],
  context: { email: string; via: 'domain' | 'fallback' },
): PickResult<T> {
  if (rows.length === 0) return { status: 'not_found' };
  const distinctTenants = new Set(rows.map((r) => r.tenant_id));
  if (distinctTenants.size > 1) {
    log.warn(
      { email: context.email, via: context.via, tenant_ids: [...distinctTenants] },
      'sso_tenant_resolution_ambiguous',
    );
    return { status: 'ambiguous' };
  }
  // rows.length > 0 was already checked above, so rows[0] always exists here.
  return { status: 'found', row: rows[0] as T };
}

// Cross-tenant discovery: this resolves WHICH tenant owns the email before any tenant
// is known, so it cannot be tenant-scoped by construction — identityAuthDb() (admin pool)
// is the only client that can see across tenants to answer the question.
export async function resolveSetaTenantFromEmail(
  email: string,
): Promise<ResolvedSetaTenant | null> {
  const at = email.indexOf('@');
  if (at < 0) return null;
  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .trim();
  if (!domain) return null;

  const result = await identityAuthDb().execute<{
    tenant_id: string;
    provider_id: string;
    entra_tenant_id: string | null;
  }>(sql`
    SELECT p.tenant_id, p.provider_id, p.entra_tenant_id
    FROM core.tenants t -- cross-schema-read: core.tenants owns email_domains; identity joins it for pre-auth SSO routing.
    JOIN identity.tenant_sso_providers p ON p.tenant_id = t.id AND p.enabled = true
    WHERE ${domain} = ANY(t.email_domains)
    LIMIT 5
  `);
  const domainPick = pickUnambiguous(result.rows, { email, via: 'domain' });
  if (domainPick.status === 'found') {
    const row = domainPick.row;
    return {
      tenant_id: row.tenant_id,
      provider_id: row.provider_id as SsoProviderId,
      entra_tenant_id: row.entra_tenant_id,
    };
  }
  if (domainPick.status === 'ambiguous') return null;

  // Fallback for environments where email-domain mapping is not yet populated:
  // if the user is pre-provisioned and their tenant has an enabled SSO provider,
  // use that provider for discovery.
  const normalizedEmail = email.toLowerCase().trim();
  const fallbackRows = await identityAuthDb()
    .select({
      tenant_id: tenantSsoProviders.tenant_id,
      provider_id: tenantSsoProviders.provider_id,
      entra_tenant_id: tenantSsoProviders.entra_tenant_id,
    })
    .from(user)
    .innerJoin(tenantSsoProviders, eq(user.tenant_id, tenantSsoProviders.tenant_id))
    .where(
      and(
        eq(tenantSsoProviders.enabled, true),
        eq(tenantSsoProviders.provider_id, 'microsoft-entra-id'),
        sql`lower(${user.email}) = ${normalizedEmail}`,
      ),
    )
    .limit(5);

  const fallbackPick = pickUnambiguous(fallbackRows, { email, via: 'fallback' });
  if (fallbackPick.status !== 'found') return null;
  const fallback = fallbackPick.row;
  return {
    tenant_id: fallback.tenant_id,
    provider_id: fallback.provider_id as SsoProviderId,
    entra_tenant_id: fallback.entra_tenant_id,
  };
}

export function validateEntraTid(
  seta: { entra_tenant_id: string | null },
  claimedTid: string,
): boolean {
  // Null linkage (M365 not yet configured for the tenant) can't be validated → reject.
  return seta.entra_tenant_id !== null && seta.entra_tenant_id === claimedTid;
}
