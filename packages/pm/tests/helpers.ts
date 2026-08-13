import { hashRoleSummary, type SessionAssignment, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import type { Pool } from 'pg';
import { bodApproveCharter, pmoSignOffCharter } from '../src/index.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));
function permsFor(roles: string[]): ReadonlySet<string> {
  return resolvePermissions(_registry, roles, IMPLICIT_PERMISSIONS);
}

export interface SeededTenant {
  tenant_id: string;
  admin_user_id: string;
  adminSession: SessionScope;
}

export async function seedTenant(pool: Pool): Promise<SeededTenant> {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenantId,
    `Test Org ${tenantId.slice(0, 8)}`,
    `test-${tenantId.slice(0, 8)}`,
  ]);
  const adminEmail = `admin-${tenantId.slice(0, 8)}@example.test`;
  const adminResult = await createUser(
    {
      tenant_id: tenantId,
      email: adminEmail,
      name: 'Test Admin',
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: 'org.admin', scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  return {
    tenant_id: tenantId,
    admin_user_id: adminResult.user_id,
    adminSession: buildSession({
      tenant_id: tenantId,
      user_id: adminResult.user_id,
      email: adminEmail,
      display_name: 'Test Admin',
      roles: ['pm.manager'],
      worker_id: adminResult.user_id,
    }),
  };
}

export function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  email?: string;
  display_name?: string;
  roles?: string[];
  /**
   * Row-scope assignments driving RBAC scope resolution (see @seta/shared-rbac resolveScope).
   * Defaults to a tenant-wide assignment per role — pm's existing tests all assume tenant-wide
   * reads, unlike people's self-scoped default.
   */
  assignments?: SessionAssignment[];
  worker_id?: string | null;
}): SessionScope {
  const roles = opts.roles ?? [];
  const role_summary = { roles, cross_tenant_read: false, assignments: [] };
  const assignments: SessionAssignment[] =
    opts.assignments ??
    roles.map((role_slug) => ({ role_slug, scope_kind: 'tenant' as const, scope_id: null }));
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email ?? `${opts.user_id}@example.test`,
    display_name: opts.display_name ?? 'Test User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: permsFor(roles),
    assignments,
    group_ids: [],
    product_access: new Set<string>(),
    person_id: opts.worker_id ?? null,
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

export async function readEvents(
  pool: Pool,
  tenantId: string,
  eventType: string,
): Promise<Array<{ event_type: string; aggregate_id: string; payload: Record<string, unknown> }>> {
  const r = await pool.query(
    `SELECT event_type, aggregate_id, payload FROM core.events
       WHERE tenant_id = $1 AND event_type = $2 ORDER BY id ASC`,
    [tenantId, eventType],
  );
  return r.rows;
}

export async function countEvents(
  pool: Pool,
  tenantId: string,
  eventType: string,
): Promise<number> {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM core.events WHERE tenant_id = $1 AND event_type = $2`,
    [tenantId, eventType],
  );
  return r.rows[0].n as number;
}

/**
 * Drives a submitted charter through both governance gates (PMO sign-off then
 * BoD approval) using throwaway pm.pmo / pm.bod sessions. Returns the created
 * project. Used by tests that just need a live project to exercise downstream
 * project/allocation operations.
 */
export async function approveCharterTwoStage(
  charter_id: string,
  tenantId: string,
): Promise<{ project_id: string; version: number }> {
  const pmo = buildSession({
    tenant_id: tenantId,
    user_id: crypto.randomUUID(),
    roles: ['pm.pmo'],
  });
  const bod = buildSession({
    tenant_id: tenantId,
    user_id: crypto.randomUUID(),
    roles: ['pm.bod'],
  });
  await pmoSignOffCharter({ charter_id, session: pmo });
  return bodApproveCharter({ charter_id, session: bod });
}
