/**
 * Integration tests for plan-delete-link cascade.
 *
 * Tests runPlanDeleteLink directly (real Postgres via testcontainers)
 * and validates subscriber logic with a fake ctx.tx that records SQL calls.
 */
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { makeWorkerUtils } from 'graphile-worker';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetIntegrationsDb } from '../../src/backend/db/client.ts';
import { runPlanDeleteLink } from '../../src/backend/m365/jobs/plan-delete-link.ts';
import { createM365PlanLinkRepo } from '../../src/backend/m365/plans/repo.ts';
import { buildM365Subscribers } from '../../src/backend/m365/subscribers.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const GROUP_G = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GROUP_H = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// Pre-assigned plan UUIDs so we don't need FK rows in planner schema
const PLAN_G1 = '11111111-1111-1111-1111-000000000001';
const PLAN_G2 = '11111111-1111-1111-1111-000000000002';
const PLAN_G3 = '11111111-1111-1111-1111-000000000003';
const PLAN_H1 = '22222222-2222-2222-2222-000000000001';
const PLAN_P = '33333333-3333-3333-3333-000000000001';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function installWorkerSchema(pool: Pool): Promise<void> {
  const utils = await makeWorkerUtils({ pgPool: pool });
  await utils.migrate();
  await utils.release();
}

async function seedTenant(pool: Pool): Promise<void> {
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test', $2)`, [
    TENANT_ID,
    't-test-plan-delete-link',
  ]);
}

async function withSetup<T>(
  fn: (ctx: { pool: Pool; db: NodePgDatabase<Record<string, never>> }) => Promise<T>,
): Promise<T> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        await installWorkerSchema(pool);
        await seedTenant(pool);
        const db = drizzle(pool, { schema: {} });
        return await fn({ pool, db });
      } finally {
        resetCoreDb();
        resetIntegrationsDb();
        await closePools();
      }
    },
  );
}

/** Returns task identifier values of all pending graphile_worker jobs. */
async function getJobPayloads(
  pool: Pool,
  identifier: string,
): Promise<Array<Record<string, unknown>>> {
  const { rows } = await pool.query(
    `SELECT j.payload
     FROM graphile_worker._private_jobs j
     JOIN graphile_worker._private_tasks t ON t.id = j.task_id
     WHERE t.identifier = $1
     ORDER BY j.id`,
    [identifier],
  );
  return rows.map((r: { payload: Record<string, unknown> }) => r.payload);
}

// ── Event builders ────────────────────────────────────────────────────────────

function makeGroupUpdatedEvent(opts: {
  tenantId: string;
  groupId: string;
  changedFields: string[];
  afterExternalSource?: 'native' | 'm365';
  actorType?: 'user' | 'system';
}) {
  const actor =
    opts.actorType === 'system'
      ? { type: 'system' as const, user_id: null as null, system_id: 'integrations.m365' as const }
      : { type: 'user' as const, user_id: SYSTEM_USER_ID };
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId: opts.tenantId,
    aggregateType: 'planner.group',
    aggregateId: opts.groupId,
    eventType: 'planner.group.updated',
    eventVersion: 1 as const,
    payload: {
      actor,
      group_id: opts.groupId,
      before: {},
      after:
        opts.afterExternalSource !== undefined ? { external_source: opts.afterExternalSource } : {},
      changed_fields: opts.changedFields,
      version_before: 1,
      version_after: 2,
    },
  };
}

function makePlanDeletedEvent(opts: {
  tenantId: string;
  planId: string;
  actorType?: 'user' | 'system';
}) {
  const actor =
    opts.actorType === 'system'
      ? { type: 'system' as const, user_id: null as null, system_id: 'integrations.m365' as const }
      : { type: 'user' as const, user_id: SYSTEM_USER_ID };
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId: opts.tenantId,
    aggregateType: 'planner.plan',
    aggregateId: opts.planId,
    eventType: 'planner.plan.deleted',
    eventVersion: 1 as const,
    payload: {
      actor,
      group_id: GROUP_G,
      plan_id: opts.planId,
      version_before: 1,
      deleted_at: new Date().toISOString(),
    },
  };
}

// ── Subscriber refs ───────────────────────────────────────────────────────────

const subs = buildM365Subscribers();

function findSub(subscription: string) {
  const sub = subs.find((s) => s.subscription === subscription);
  if (!sub) throw new Error(`Subscriber not found: ${subscription}`);
  return sub;
}

const groupUnlinkSub = findSub('integrations.m365.plan-delete-link-on-group-unlink');
const planDeletedSub = findSub('integrations.m365.plan-delete-link-on-plan-deleted');
const autoMirrorSub = findSub('integrations.m365.plan-auto-mirror');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runPlanDeleteLink', () => {
  it('group_unlinked trigger tombstones all link rows for that group, leaves other group untouched', async () => {
    await withSetup(async ({ db }) => {
      const repo = createM365PlanLinkRepo({ db: db as never });

      // Seed 3 links for group G
      await repo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_G,
        planId: PLAN_G1,
        externalId: 'ext-g1',
        initialSnapshot: {},
      });
      await repo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_G,
        planId: PLAN_G2,
        externalId: 'ext-g2',
        initialSnapshot: {},
      });
      await repo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_G,
        planId: PLAN_G3,
        externalId: 'ext-g3',
        initialSnapshot: {},
      });

      // Seed 1 link for group H — must not be touched
      await repo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_H,
        planId: PLAN_H1,
        externalId: 'ext-h1',
        initialSnapshot: {},
      });

      const result = await runPlanDeleteLink(
        { tenant_id: TENANT_ID, trigger: 'group_unlinked', group_id: GROUP_G },
        { planLinkRepo: repo },
      );

      expect(result.tombstoned).toBe(3);

      // G's plans are gone
      expect(await repo.findByPlan(PLAN_G1)).toBeNull();
      expect(await repo.findByPlan(PLAN_G2)).toBeNull();
      expect(await repo.findByPlan(PLAN_G3)).toBeNull();

      // H's plan is still live
      expect(await repo.findByPlan(PLAN_H1)).not.toBeNull();
    });
  });

  it('plan_deleted trigger tombstones the single link', async () => {
    await withSetup(async ({ db }) => {
      const repo = createM365PlanLinkRepo({ db: db as never });

      await repo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_G,
        planId: PLAN_P,
        externalId: 'ext-p1',
        initialSnapshot: {},
      });

      const result = await runPlanDeleteLink(
        { tenant_id: TENANT_ID, trigger: 'plan_deleted', plan_id: PLAN_P },
        { planLinkRepo: repo },
      );

      expect(result.tombstoned).toBe(1);
      expect(await repo.findByPlan(PLAN_P)).toBeNull();
    });
  });

  it('plan_deleted trigger is a no-op when no link exists', async () => {
    await withSetup(async ({ db }) => {
      const repo = createM365PlanLinkRepo({ db: db as never });

      const result = await runPlanDeleteLink(
        {
          tenant_id: TENANT_ID,
          trigger: 'plan_deleted',
          plan_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        },
        { planLinkRepo: repo },
      );

      expect(result.tombstoned).toBe(0);
    });
  });
});

describe('handleGroupUnlinkedForPlans subscriber', () => {
  it('group.updated with after.external_source=native enqueues plan-delete-link job', async () => {
    await withSetup(async ({ pool, db }) => {
      const event = makeGroupUpdatedEvent({
        tenantId: TENANT_ID,
        groupId: GROUP_G,
        changedFields: ['external_source', 'external_id'],
        afterExternalSource: 'native',
      });

      await db.transaction(async (tx) => groupUnlinkSub.handler(event, { tx: tx as never }));

      const payloads = await getJobPayloads(pool, 'm365.plan.delete-link');
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({
        tenant_id: TENANT_ID,
        trigger: 'group_unlinked',
        group_id: GROUP_G,
      });
    });
  });

  it('group.updated with after.external_source=m365 (link) does NOT enqueue plan-delete-link', async () => {
    await withSetup(async ({ pool, db }) => {
      const event = makeGroupUpdatedEvent({
        tenantId: TENANT_ID,
        groupId: GROUP_G,
        changedFields: ['external_source', 'external_id'],
        afterExternalSource: 'm365',
      });

      await db.transaction(async (tx) => groupUnlinkSub.handler(event, { tx: tx as never }));

      const payloads = await getJobPayloads(pool, 'm365.plan.delete-link');
      expect(payloads).toHaveLength(0);
    });
  });

  it('group.updated without external_source in changed_fields does NOT enqueue', async () => {
    await withSetup(async ({ pool, db }) => {
      const event = makeGroupUpdatedEvent({
        tenantId: TENANT_ID,
        groupId: GROUP_G,
        changedFields: ['name'],
        afterExternalSource: 'native',
      });

      await db.transaction(async (tx) => groupUnlinkSub.handler(event, { tx: tx as never }));

      const payloads = await getJobPayloads(pool, 'm365.plan.delete-link');
      expect(payloads).toHaveLength(0);
    });
  });

  it('system actor (M365 sync) → no enqueue (skip-loop)', async () => {
    await withSetup(async ({ pool, db }) => {
      const event = makeGroupUpdatedEvent({
        tenantId: TENANT_ID,
        groupId: GROUP_G,
        changedFields: ['external_source', 'external_id'],
        afterExternalSource: 'native',
        actorType: 'system',
      });

      await db.transaction(async (tx) => groupUnlinkSub.handler(event, { tx: tx as never }));

      const payloads = await getJobPayloads(pool, 'm365.plan.delete-link');
      expect(payloads).toHaveLength(0);
    });
  });
});

describe('handlePlanDeletedForLinks subscriber', () => {
  it('plan.deleted enqueues plan-delete-link with trigger=plan_deleted', async () => {
    await withSetup(async ({ pool, db }) => {
      const event = makePlanDeletedEvent({ tenantId: TENANT_ID, planId: PLAN_P });

      await db.transaction(async (tx) => planDeletedSub.handler(event, { tx: tx as never }));

      const payloads = await getJobPayloads(pool, 'm365.plan.delete-link');
      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({
        tenant_id: TENANT_ID,
        trigger: 'plan_deleted',
        plan_id: PLAN_P,
      });
    });
  });

  it('system actor (M365 sync) → no enqueue (skip-loop)', async () => {
    await withSetup(async ({ pool, db }) => {
      const event = makePlanDeletedEvent({
        tenantId: TENANT_ID,
        planId: PLAN_P,
        actorType: 'system',
      });

      await db.transaction(async (tx) => planDeletedSub.handler(event, { tx: tx as never }));

      const payloads = await getJobPayloads(pool, 'm365.plan.delete-link');
      expect(payloads).toHaveLength(0);
    });
  });
});

describe('handlePlanAutoMirror regression: does NOT fire on unlink', () => {
  it('group.updated with after.external_source=native does NOT enqueue auto-mirror job', async () => {
    await withSetup(async ({ pool, db }) => {
      // Even with a group link row seeded, the auto-mirror subscriber must not fire on unlink.
      // Seed a group link so the repo.findByGroup call returns something (otherwise it returns early anyway).
      await pool.query(
        `INSERT INTO integrations.m365_group_links (id, tenant_id, group_id, external_id, sync_status, last_synced_fields)
         VALUES ($1, $2, $3, 'ext-grp-regression', 'idle', '{}')`,
        [crypto.randomUUID(), TENANT_ID, GROUP_G],
      );

      const event = makeGroupUpdatedEvent({
        tenantId: TENANT_ID,
        groupId: GROUP_G,
        changedFields: ['external_source'],
        afterExternalSource: 'native',
      });

      await db.transaction(async (tx) => autoMirrorSub.handler(event, { tx: tx as never }));

      const payloads = await getJobPayloads(pool, 'm365.plan.auto-mirror');
      expect(payloads).toHaveLength(0);
    });
  });
});
