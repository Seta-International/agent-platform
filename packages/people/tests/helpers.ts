import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import type { Pool } from 'pg';
import { peopleDb } from '../src/backend/db/client.ts';
import { orgUnit } from '../src/backend/db/schema.ts';

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
      roles: ['people.strategic'],
    }),
  };
}

export function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  email?: string;
  display_name?: string;
  roles?: string[];
}): SessionScope {
  const roles = opts.roles ?? [];
  const role_summary = { roles, cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email ?? `${opts.user_id}@example.test`,
    display_name: opts.display_name ?? 'Test User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: permsFor(roles),
    features: new Set<string>(),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

export async function seedOrgUnit(opts: {
  tenant_id: string;
  name: string;
  kind: string;
  parent_id?: string | null;
  head_worker_id?: string | null;
}): Promise<string> {
  const [u] = await peopleDb()
    .insert(orgUnit)
    .values({
      tenant_id: opts.tenant_id,
      name: opts.name,
      kind: opts.kind,
      parent_id: opts.parent_id ?? null,
      head_worker_id: opts.head_worker_id ?? null,
      sort: 0,
    })
    .returning();
  return u!.id;
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
