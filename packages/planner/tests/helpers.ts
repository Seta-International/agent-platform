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
import { createGroup, createPlan, createTask } from '../src/index.ts';
import type { PlannerRoleSlug } from '../src/rbac.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));
function permsFor(roles: string[]): ReadonlySet<string> {
  return resolvePermissions(_registry, roles, IMPLICIT_PERMISSIONS);
}

export interface SeedUser {
  name: string;
  email: string;
}

export interface SeededUser {
  user_id: string;
  name: string;
  email: string;
}

export interface SeededTenant {
  tenant_id: string;
  admin: SeededUser;
  users: SeededUser[];
  adminSession: SessionScope;
}

export async function seedTenant(
  pool: Pool,
  opts: { name?: string; slug?: string; users?: SeedUser[] } = {},
): Promise<SeededTenant> {
  const tenantId = crypto.randomUUID();
  const tenantName = opts.name ?? `Test Org ${tenantId.slice(0, 8)}`;
  const tenantSlug = opts.slug ?? `test-${tenantId.slice(0, 8)}`;

  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
    tenantId,
    tenantName,
    tenantSlug,
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
  const admin: SeededUser = {
    user_id: adminResult.user_id,
    name: 'Test Admin',
    email: adminEmail,
  };

  await pool.query(
    `INSERT INTO planner.assignee_projection
       (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
       VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC')
       ON CONFLICT (user_id) DO NOTHING`,
    [admin.user_id, tenantId, admin.name, admin.email],
  );

  // Insert assignee_projection rows directly: planner reads need them and the
  // identity → projection subscriber is not wired yet.
  const users: SeededUser[] = [];
  for (const u of opts.users ?? []) {
    const r = await createUser(
      {
        tenant_id: tenantId,
        email: u.email,
        name: u.name,
        password: 'correct-horse-battery-staple',
      },
      { type: 'cli', user_id: null },
    );
    const normalizedEmail = u.email.toLowerCase().trim();
    users.push({ user_id: r.user_id, name: u.name, email: normalizedEmail });

    await pool.query(
      `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
      [r.user_id, tenantId, u.name, normalizedEmail],
    );
  }

  return {
    tenant_id: tenantId,
    admin,
    users,
    adminSession: buildSession({
      tenant_id: tenantId,
      user_id: admin.user_id,
      email: admin.email,
      display_name: admin.name,
      roles: ['org.admin'],
      accessible_group_ids: [],
    }),
  };
}

export function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  email?: string;
  display_name?: string;
  roles?: string[];
  accessible_group_ids?: string[];
  cross_tenant_read?: boolean;
}): SessionScope {
  const roles = opts.roles ?? [];
  const role_summary = {
    roles,
    cross_tenant_read: opts.cross_tenant_read ?? false,
  };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email ?? `${opts.user_id}@example.test`,
    display_name: opts.display_name ?? 'Test User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: permsFor(roles),
    accessible_group_ids: opts.accessible_group_ids ?? [],
    cross_tenant_read: role_summary.cross_tenant_read,
    built_at: new Date(),
    invalidated_at: null,
  };
}

export interface SeededWithTask {
  tenant_id: string;
  group_id: string;
  plan_id: string;
  task_id: string;
  /** Session for the member with the requested planner role. */
  session: SessionScope;
  /** Admin session for additional setup. */
  admin_session: SessionScope;
  /** The non-admin user added to the group as a regular member. */
  member: SeededUser;
}

/**
 * Seed `tenant + admin + member + group + plan + task` and return a session
 * for the member carrying the requested planner role. Used by comment-domain
 * tests where many cases need the same fixture under different role/permission
 * shapes.
 */
export async function seedTenantAndTask(
  pool: Pool,
  opts: { role: PlannerRoleSlug },
): Promise<SeededWithTask> {
  const tag = crypto.randomUUID().slice(0, 8);
  const memberEmail = `member-${tag}@example.test`;
  const seeded = await seedTenant(pool, {
    users: [{ name: `Member ${tag}`, email: memberEmail }],
  });
  const member = seeded.users[0];
  if (!member) throw new Error('seedTenantAndTask: no member user');

  const group = await createGroup({
    tenant_id: seeded.tenant_id,
    name: `Group ${tag}`,
    session: seeded.adminSession,
    initial_members: [{ user_id: member.user_id, role: 'member' }],
  });
  const plan = await createPlan({
    group_id: group.id,
    name: `Plan ${tag}`,
    session: seeded.adminSession,
  });
  const task = await createTask({
    plan_id: plan.id,
    title: `Task ${tag}`,
    session: seeded.adminSession,
  });

  const session = buildSession({
    tenant_id: seeded.tenant_id,
    user_id: member.user_id,
    email: member.email,
    display_name: member.name,
    roles: [opts.role],
    accessible_group_ids: [group.id],
  });

  return {
    tenant_id: seeded.tenant_id,
    group_id: group.id,
    plan_id: plan.id,
    task_id: task.id,
    session,
    admin_session: seeded.adminSession,
    member,
  };
}

/**
 * Create an extra group member with the given group-membership role
 * ('owner'/'member') and return a session for them. Always grants the
 * planner.contributor role on the session so planner permission checks pass —
 * group-role authorization happens via planner.group_members lookups inside
 * the domain functions.
 */
export async function makeMemberSession(
  pool: Pool,
  opts: { tenant_id: string; group_id: string; role: 'owner' | 'member' },
): Promise<SessionScope> {
  const tag = crypto.randomUUID().slice(0, 8);
  const email = `extra-${tag}@example.test`;
  const r = await createUser(
    {
      tenant_id: opts.tenant_id,
      email,
      name: `User ${tag}`,
      password: 'correct-horse-battery-staple',
    },
    { type: 'cli', user_id: null },
  );

  await pool.query(
    `INSERT INTO planner.assignee_projection
       (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
       VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC')
       ON CONFLICT (user_id) DO NOTHING`,
    [r.user_id, opts.tenant_id, `User ${tag}`, email],
  );
  await pool.query(
    `INSERT INTO planner.group_members (group_id, user_id, role, added_by)
       VALUES ($1, $2, $3, $2)
       ON CONFLICT DO NOTHING`,
    [opts.group_id, r.user_id, opts.role],
  );

  return buildSession({
    tenant_id: opts.tenant_id,
    user_id: r.user_id,
    email,
    display_name: `User ${tag}`,
    roles: ['planner.contributor'],
    accessible_group_ids: [opts.group_id],
  });
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
