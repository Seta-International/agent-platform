import type { Pool } from 'pg';
import { getPool } from './pools.ts';

/**
 * The pre-tenant app-role pool. better-auth's email lookup runs before any tenant is known,
 * against `identity.user`, which is deliberately RLS-exempt for exactly this reason
 * (packages/identity/drizzle/0001_identity_platform.sql:30). No tenant GUC is bound.
 *
 * Every new caller widens an authentication-time hole. Add one only if it genuinely cannot
 * know its tenant, and say why at the call site.
 */
export function preTenantAppPool(): Pool {
  return getPool('web');
}

/**
 * The pre-tenant admin pool, RLS bypassed. SSO tenant resolution reads the RLS'd
 * `identity.tenant_sso_providers` before any tenant exists, because "which tenant owns this
 * email domain" is inherently cross-tenant. The login throttle shares it.
 *
 * Strictly narrower than it looks: this is the ONLY admin pool reachable from module code.
 * Every new caller widens an authentication-time hole.
 */
export function preTenantAdminPool(): Pool {
  return getPool('worker');
}
