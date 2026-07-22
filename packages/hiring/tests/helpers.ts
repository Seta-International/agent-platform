import { hashRoleSummary, type SessionAssignment, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import {
  bodApproveCharter,
  createAccount,
  pmoSignOffCharter,
  setProjectAccess,
  submitCharter,
} from '@seta/pm';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import type { Pool } from 'pg';

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
      roles: ['hiring.recruiter', 'people.manager'],
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
   * Defaults to a tenant-wide assignment per role — existing hiring tests all assume
   * tenant-wide reads.
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

/**
 * Seeds a pm project owned (owner-level project access) by `ownerWorkerId`, going through the
 * real pm charter → PMO → BoD → grant path so hiring's row scope resolves it via @seta/pm
 * (`listProjectIdsOwnedBy`) rather than a hiring-local projection. Returns the pm-generated
 * project_id plus the account the charter hangs off. `session` must carry pm.manager.
 */
export async function seedOwnedProject(opts: {
  tenant_id: string;
  session: SessionScope;
  ownerWorkerId: string;
  projectName?: string;
}): Promise<{ project_id: string; account_id: string }> {
  const { account_id } = await createAccount({
    name: `Acct ${crypto.randomUUID().slice(0, 8)}`,
    session: opts.session,
  });
  const { project_id } = await submitCharter({
    account_id,
    name: opts.projectName ?? 'Seeded Project',
    pm_worker_id: opts.session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session: opts.session,
  });
  const pmo = buildSession({
    tenant_id: opts.tenant_id,
    user_id: crypto.randomUUID(),
    roles: ['pm.pmo'],
  });
  const bod = buildSession({
    tenant_id: opts.tenant_id,
    user_id: crypto.randomUUID(),
    roles: ['pm.bod'],
  });
  await pmoSignOffCharter({ charter_id: project_id, session: pmo });
  await bodApproveCharter({ charter_id: project_id, session: bod });
  await setProjectAccess({
    project_id,
    grants: [{ worker_id: opts.ownerWorkerId, level: 'owner' }],
    session: opts.session,
  });
  return { project_id, account_id };
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
