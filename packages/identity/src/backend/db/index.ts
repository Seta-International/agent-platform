import { getPool, type NodePgDatabase } from '@seta/shared-db';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import * as schema from './schema.ts';

// Cache key includes the underlying Pool so closePools()+initPools() (tests,
// graceful restart) doesn't leave us wrapping a dead Pool reference.
let cached: { pool: Pool; db: NodePgDatabase<typeof schema> } | null = null;
let cachedAuth: { pool: Pool; db: NodePgDatabase<typeof schema> } | null = null;

/** Auth-runtime reads that run BEFORE a tenant is known: better-auth's email lookup,
 *  SSO tenant resolution, the login throttle. Every table these touch is RLS-exempt
 *  (identity.user/session/account/verification/rate_limit/failed_login_*, core.tenants),
 *  so there is no tenant GUC to set and no executor context to join. */
export function identityAuthDb(): NodePgDatabase<typeof schema> {
  const pool = getPool('worker');
  if (!cachedAuth || cachedAuth.pool !== pool) {
    cachedAuth = { pool, db: drizzle(pool, { schema }) };
  }
  return cachedAuth.db;
}

/** Tenant-scoped identity domain: role assignments, access groups, product grants,
 *  SSO provider config, projections. Requires an executor context. */
export function identityDb(): NodePgDatabase<typeof schema> {
  const pool = getPool('worker');
  if (!cached || cached.pool !== pool) {
    cached = { pool, db: drizzle(pool, { schema }) };
  }
  return cached.db;
}

/** Reset the cached instances. Use only in tests via @seta/identity/testing. */
export function resetIdentityDb(): void {
  cached = null;
  cachedAuth = null;
}

export type IdentityDb = ReturnType<typeof identityDb>;
export * as identitySchema from './schema.ts';
