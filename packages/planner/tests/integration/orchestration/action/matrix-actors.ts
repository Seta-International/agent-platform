import { randomUUID } from 'node:crypto';
import { createUser } from '@seta/identity';
import type { Pool } from 'pg';
import { seedGroup, seedGroupMembers, seedTasksFixture } from './seed-tasks-fixture.ts';

export type MatrixRole = 'planner.admin' | 'planner.member' | 'planner.viewer' | 'org.admin';

/** The three base scopes. 'second-group' and 'third-group' exist only for the
 *  multi-group block and are deliberately NOT in MATRIX_SCOPES, so the base
 *  matrix stays 84 cells. */
export type MatrixScope =
  | 'own-group'
  | 'other-group'
  | 'other-tenant'
  | 'second-group'
  | 'third-group';

export const MATRIX_ROLES: MatrixRole[] = [
  'planner.admin',
  'planner.member',
  'planner.viewer',
  'org.admin',
];
export const MATRIX_SCOPES: MatrixScope[] = ['own-group', 'other-group', 'other-tenant'];

/** One place a cell can aim at: a group, its plan, its first column, and one
 *  member of it (the assign operation needs somebody to assign). */
export interface ScopeFixture {
  /** The tenant that OWNS this plan — for 'other-tenant' it is NOT the actor's. */
  ownerTenantId: string;
  /** The org.admin `seedTasksFixture` minted with the tenant. Every later scope in
   *  the SAME tenant has to hand this back, because creating a tenant is what
   *  mints its admin and a second one would collide on the derived email. */
  tenantAdminUserId: string;
  groupId: string;
  planId: string;
  bucketId: string;
  memberUserId: string;
  memberName: string;
}

export interface MatrixWorld {
  /** The ACTORS' tenant. Every runner passes this as the session tenant, because
   *  reaching into another tenant is the thing under test — not a differently
   *  scoped session. */
  tenantId: string;
  /** One actor per role. All four are members of the own group; `org.admin`'s
   *  reach comes from its tenant-wide role rather than that membership. */
  actors: Record<MatrixRole, string>;
  /** `planner.member`, a member of the own group AND the second group, and of
   *  nothing else. */
  multiGroupUserId: string;
  scopes: Record<MatrixScope, ScopeFixture>;
  pool: Pool;
}

/** Reach over one group. Separate from the role grant below, because that is how
 *  `requirePermission` reads them: permission from the role, reach from here. */
export async function joinGroup(
  pool: Pool,
  opts: { tenantId: string; userId: string; groupId: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.group_members (tenant_id, group_id, user_id, role, added_by)
     VALUES ($1, $2, $3, 'member', $3)
     ON CONFLICT DO NOTHING`,
    [opts.tenantId, opts.groupId, opts.userId],
  );
}

/**
 * A real user with a tenant-wide role and membership of one group.
 *
 * `identity.role_assignments.scope_kind` is only ever `tenant | org_unit | self`
 * — there is no group-scoped role. Planner permissions therefore come from a
 * TENANT-WIDE role, and reach over a particular group comes from
 * `planner.group_members`; `requirePermission` checks the two separately. A
 * fixture that granted "planner.member on group X" would be pinning a model the
 * product does not have.
 *
 * A real `identity.users` row, not a bare uuid: `listRoleAssignments` throws
 * `USER_NOT_FOUND` for an unknown id, so a synthetic actor would be refused
 * everywhere for the wrong reason and the matrix would prove nothing.
 */
async function seedActor(
  pool: Pool,
  opts: { tenantId: string; groupId: string; role: MatrixRole; label: string },
): Promise<string> {
  const { user_id } = await createUser(
    {
      tenant_id: opts.tenantId,
      email: `${opts.label.replace(/[^a-z]+/gi, '-')}-${randomUUID().slice(0, 8)}@example.test`,
      name: opts.label,
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: opts.role, scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  await joinGroup(pool, { tenantId: opts.tenantId, userId: user_id, groupId: opts.groupId });
  return user_id;
}

async function seedScope(
  pool: Pool,
  opts: {
    label: string;
    /** Omitted for a scope that needs a tenant of its very own. */
    tenant?: { tenantId: string; actorUserId: string };
  },
): Promise<ScopeFixture> {
  const seeded = await seedTasksFixture(pool, {
    titles: [],
    planName: `${opts.label} plan`,
    // Both or neither: `seedTasksFixture` mints the tenant's admin, so an
    // existing tenant has to bring its own actor or the derived email collides.
    ...(opts.tenant
      ? { tenantId: opts.tenant.tenantId, actorUserId: opts.tenant.actorUserId }
      : {}),
  });
  const [memberUserId] = await seedGroupMembers(pool, {
    tenantId: seeded.tenantId,
    groupId: seeded.groupId,
    count: 1,
    displayName: `${opts.label} assignee`,
  });
  return {
    ownerTenantId: seeded.tenantId,
    tenantAdminUserId: seeded.actorUserId,
    groupId: seeded.groupId,
    planId: seeded.planId,
    bucketId: seeded.bucketId,
    memberUserId: memberUserId!,
    memberName: `${opts.label} assignee`,
  };
}

/**
 * The whole matrix world, built ONCE per test file.
 *
 * 98 cells each resolving their own session is already 98 database round trips;
 * seeding per cell would be several times that, and every actor here costs a
 * password hash. Every cell reads this and writes only what it is testing.
 */
export async function seedMatrixWorld(pool: Pool): Promise<MatrixWorld> {
  const own = await seedScope(pool, { label: 'Own' });
  const tenant = { tenantId: own.ownerTenantId, actorUserId: own.tenantAdminUserId };
  const other = await seedScope(pool, { label: 'Other group', tenant });
  const second = await seedScope(pool, { label: 'Second group', tenant });
  const third = await seedScope(pool, { label: 'Third group', tenant });
  // No `tenant`, so this one mints a tenant of its own.
  const otherTenant = await seedScope(pool, { label: 'Foreign' });

  const actors = {} as Record<MatrixRole, string>;
  for (const role of MATRIX_ROLES) {
    actors[role] = await seedActor(pool, {
      tenantId: own.ownerTenantId,
      groupId: own.groupId,
      role,
      label: role,
    });
  }

  const multiGroupUserId = await seedActor(pool, {
    tenantId: own.ownerTenantId,
    groupId: own.groupId,
    role: 'planner.member',
    label: 'multi group member',
  });
  await joinGroup(pool, {
    tenantId: own.ownerTenantId,
    userId: multiGroupUserId,
    groupId: second.groupId,
  });

  return {
    tenantId: own.ownerTenantId,
    actors,
    multiGroupUserId,
    scopes: {
      'own-group': own,
      'other-group': other,
      'other-tenant': otherTenant,
      'second-group': second,
      'third-group': third,
    },
    pool,
  };
}

/**
 * A fresh task in the scope's plan.
 *
 * Per CELL, not per world: `merge` sends its duplicate to the trash and `update`
 * bumps a version, so a shared target task would make one cell's outcome depend
 * on which cells ran before it. Seeding a task is one INSERT; seeding an actor is
 * a password hash and a session resolution, which is why only the former repeats.
 */
export async function seedMatrixTask(
  world: MatrixWorld,
  scope: MatrixScope,
  title: string,
): Promise<{ taskId: string; version: number }> {
  const s = world.scopes[scope];
  const taskId = randomUUID();
  const rows = await world.pool.query<{ version: number }>(
    `INSERT INTO planner.tasks (id, tenant_id, plan_id, bucket_id, title, created_by, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING version`,
    [taskId, s.ownerTenantId, s.planId, s.bucketId, title, randomUUID()],
  );
  return { taskId, version: rows.rows[0]!.version };
}

/** Where a cell should aim: a task nobody else has touched, plus the plan and
 *  group it lives in. */
export async function targetFor(world: MatrixWorld, scope: MatrixScope) {
  const s = world.scopes[scope];
  const task = await seedMatrixTask(world, scope, `Matrix target (${scope})`);
  return { ...task, planId: s.planId, groupId: s.groupId, scope: s };
}

export { seedGroup };
