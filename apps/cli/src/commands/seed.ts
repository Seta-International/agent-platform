import { computeAccessibleGroups, hashRoleSummary, rollup, type SessionScope } from '@seta/core';
import { coreDb } from '@seta/core/db';
import { listRoleAssignments } from '@seta/identity';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { sql } from 'drizzle-orm';
import { UUID_RE } from './lib/tenant-resolve.ts';

async function resolveUserIdByEmail(tenantId: string, email: string): Promise<string> {
  if (UUID_RE.test(email)) return email;
  const row = await coreDb().execute(sql`
    SELECT id FROM identity."user"
    WHERE tenant_id = ${tenantId} AND lower(email) = lower(${email})
    LIMIT 1
  `);
  const id = (row.rows[0] as { id?: string } | undefined)?.id;
  if (!id) throw new Error(`No user with email ${email} in tenant ${tenantId}`);
  return id;
}

const rbacRegistry = buildRegistry(inventoryToManifests(INVENTORY));

export async function buildAdminSession(
  tenantId: string,
  adminEmail: string,
): Promise<SessionScope> {
  const userId = await resolveUserIdByEmail(tenantId, adminEmail);
  const { assignments } = await listRoleAssignments(userId);
  const role_summary = rollup(assignments);
  return {
    session_id: `cli-import-${userId}`,
    user_id: userId,
    tenant_id: tenantId,
    email: adminEmail,
    display_name: adminEmail,
    role_summary,
    permissions: resolvePermissions(rbacRegistry, role_summary.roles, IMPLICIT_PERMISSIONS),
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: computeAccessibleGroups(assignments),
    assignments: role_summary.assignments,
    group_ids: [],
    product_access: new Set<string>(),
    worker_id: null,
    cross_tenant_read: role_summary.cross_tenant_read,
    built_at: new Date(),
    invalidated_at: null,
  };
}
