// packages/planner/tests/fixtures/golden/action/world.ts
//
// The A2 corpus's own tenant (design D2).
//
// Built on the three low-level seeders the A2 integration suites already use
// (`seedTasksFixture`, `seedGroup`, `seedGroupMembers`) rather than on
// `seedMatrixWorld`, which mints five tenants and four password hashes for a
// permission matrix this corpus does not re-prove.
//
// The A1 golden tenant is never touched here. That is what keeps
// `computeSeedChecksum()` and `golden-facts.json` valid: a mutation case that
// touched a golden task would drift the facts `preflightGolden` re-derives from
// live SQL, while the checksum — which hashes SOURCE files — would stay blind.
import { randomUUID } from 'node:crypto';
import { buildActorSession, createUser } from '@seta/identity';
import type { Pool } from 'pg';
import {
  seedGroup,
  seedGroupMembers,
  seedTasksFixture,
} from '../../../integration/orchestration/action/seed-tasks-fixture.ts';
import { ACTION_TASK_SCOPED_TABLES } from './constants.ts';

export interface ActionWorld {
  /** The actors' tenant. */
  tenantId: string;
  /** A second tenant, for the cross-tenant refusal cases. */
  foreignTenantId: string;
  /** The tenant admin `seedTasksFixture` minted with the tenant. Reused as
   *  `created_by` so no fixture has to invent an author. */
  adminUserId: string;
  /** `planner.member`, a member of `groupId`. The default actor. */
  memberUserId: string;
  memberName: string;
  /** `planner.viewer`, a member of the same group. The refusal cases run as this. */
  viewerUserId: string;
  /** A second member of the group, so an assign case has somebody to add. */
  peerUserId: string;
  peerName: string;
  groupId: string;
  /** A group in the SAME tenant that the actors are NOT members of. */
  otherGroupId: string;
  planId: string;
  planName: string;
  bucketId: string;
  /** A plan in `otherGroupId`, for the out-of-group refusals. */
  otherPlanId: string;
  otherBucketId: string;
  /** A plan in `foreignTenantId`. */
  foreignPlanId: string;
  foreignBucketId: string;
  /** Effective permissions per actor, resolved from the real role assignment and
   *  handed to the eval target — the cross-module READ tools re-check their
   *  declared `rbac` against this set, so an empty one refuses everything. */
  permissions: { member: ReadonlySet<string>; viewer: ReadonlySet<string> };
}

async function actor(
  pool: Pool,
  opts: { tenantId: string; groupId: string; role: string; name: string },
): Promise<string> {
  const { user_id } = await createUser(
    {
      tenant_id: opts.tenantId,
      email: `${opts.name.replace(/[^a-z]+/gi, '-').toLowerCase()}-${randomUUID().slice(0, 8)}@a2.test`,
      name: opts.name,
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: opts.role, scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  await pool.query(
    `INSERT INTO planner.group_members (tenant_id, group_id, user_id, role, added_by)
     VALUES ($1, $2, $3, 'member', $3) ON CONFLICT DO NOTHING`,
    [opts.tenantId, opts.groupId, user_id],
  );
  // The assign port resolves people through this projection, so anybody who can
  // be ASSIGNED must exist in it — not only in identity.
  await pool.query(
    `INSERT INTO planner.assignee_projection
       (tenant_id, user_id, display_name, email, availability_status, timezone)
     VALUES ($1, $2, $3, $4, 'available', 'UTC') ON CONFLICT DO NOTHING`,
    [opts.tenantId, user_id, opts.name, `${user_id}@a2.test`],
  );
  return user_id;
}

export async function seedActionWorld(pool: Pool): Promise<ActionWorld> {
  const own = await seedTasksFixture(pool, { titles: [], planName: 'A2 Plan' });
  const tenantId = own.tenantId;

  const otherGroupId = await seedGroup(pool, { tenantId });
  // Both `tenantId` and `actorUserId`, or neither: creating a tenant is what mints
  // its admin, and a second `createUser` would collide on the derived email.
  const other = await seedTasksFixture(pool, {
    titles: [],
    planName: 'A2 Other Group Plan',
    tenantId,
    actorUserId: own.actorUserId,
  });
  // No tenant passed, so this one mints a tenant of its own.
  const foreign = await seedTasksFixture(pool, { titles: [], planName: 'A2 Foreign Plan' });

  const memberUserId = await actor(pool, {
    tenantId,
    groupId: own.groupId,
    role: 'planner.member',
    name: 'A2 Member',
  });
  const viewerUserId = await actor(pool, {
    tenantId,
    groupId: own.groupId,
    role: 'planner.viewer',
    name: 'A2 Viewer',
  });
  const [peerUserId] = await seedGroupMembers(pool, {
    tenantId,
    groupId: own.groupId,
    count: 1,
    displayName: 'Tuấn',
  });

  const memberSession = await buildActorSession({ user_id: memberUserId });
  const viewerSession = await buildActorSession({ user_id: viewerUserId });

  return {
    tenantId,
    foreignTenantId: foreign.tenantId,
    adminUserId: own.actorUserId,
    memberUserId,
    memberName: 'A2 Member',
    viewerUserId,
    peerUserId: peerUserId!,
    peerName: 'Tuấn',
    groupId: own.groupId,
    otherGroupId,
    planId: own.planId,
    planName: own.planName,
    bucketId: own.bucketId,
    otherPlanId: other.planId,
    otherBucketId: other.bucketId,
    foreignPlanId: foreign.planId,
    foreignBucketId: foreign.bucketId,
    permissions: {
      member: memberSession.permissions as ReadonlySet<string>,
      viewer: viewerSession.permissions as ReadonlySet<string>,
    },
  };
}

/**
 * Between cases: every task-scoped row in BOTH A2 tenants, and nothing else.
 *
 * Not a savepoint. The agent writes through the `initPools()` pool, so
 * consecutive queries may land on different pooled connections and a transaction
 * the test holds does not enclose the agent's writes — the "per-case savepoint"
 * the superseded 2026-07-29 spec proposed is not implementable.
 */
export async function resetActionWorld(pool: Pool, world: ActionWorld): Promise<void> {
  for (const tenantId of [world.tenantId, world.foreignTenantId]) {
    await pool.query('DELETE FROM core.events WHERE tenant_id = $1', [tenantId]);
    for (const table of ACTION_TASK_SCOPED_TABLES) {
      await pool.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
    }
  }
}

/** End of lane: the whole world, both tenants. Mirrors `cleanGoldenDataset`'s
 *  child-first order so no FK blocks a delete. */
export async function cleanActionWorld(pool: Pool, world: ActionWorld): Promise<void> {
  await resetActionWorld(pool, world);
  for (const tenantId of [world.tenantId, world.foreignTenantId]) {
    await pool.query('DELETE FROM planner.buckets WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM planner.plans WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM planner.group_members WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM planner.groups WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM planner.assignee_projection WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM core.tenants WHERE id = $1', [tenantId]);
  }
}
