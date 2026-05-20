import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import type { Pool } from 'pg';

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
  const role_summary = {
    roles: opts.roles ?? [],
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
    accessible_group_ids: opts.accessible_group_ids ?? [],
    cross_tenant_read: role_summary.cross_tenant_read,
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
