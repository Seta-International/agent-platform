import { type SQL, sql } from 'drizzle-orm';

/**
 * Advisory-lock statement serializing org-unit structural writes for one tenant.
 *
 * `updateOrgUnit`'s cycle check and `deleteOrgUnit`'s has_children/has_members checks each read
 * the org-unit tree and then write based on what they saw; without serialization, two concurrent
 * calls can both observe a cycle-free tree and both commit, producing a real cycle (or a delete
 * racing a reparent). Both domain functions take this lock as the first statement inside their
 * `withEmit` transaction so they serialize against each other and against themselves.
 *
 * Namespaced with a fixed string hash (not shared with rate-limit.ts's per-tenant/user lock or
 * set-tenant-email-domains.ts's fixed-key lock) so the two-int key can't collide with theirs.
 */
export function orgUnitWriteLock(tenantId: string): SQL {
  return sql`SELECT pg_advisory_xact_lock(hashtext('people.org_unit.write'), hashtext(${tenantId}))`;
}
