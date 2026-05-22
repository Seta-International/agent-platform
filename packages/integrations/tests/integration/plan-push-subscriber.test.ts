import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { makeWorkerUtils } from 'graphile-worker';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetIntegrationsDb } from '../../src/db/client.ts';
import { createM365PlanLinkRepo } from '../../src/m365/plans/repo.ts';
import { createM365GroupLinkRepo } from '../../src/m365/repo.ts';
import { buildM365Subscribers } from '../../src/m365/subscribers.ts';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

async function installWorkerSchema(pool: Pool): Promise<void> {
  const utils = await makeWorkerUtils({ pgPool: pool });
  await utils.migrate();
  await utils.release();
}

async function seedLinkedPlan(pool: Pool) {
  const tenantId = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Test', $2)`, [
    tenantId,
    `t-${tenantId.slice(0, 8)}`,
  ]);
  const groupId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO planner.groups (id, tenant_id, name, external_source, external_id, created_by)
     VALUES ($1, $2, 'Eng', 'm365', 'ext-grp-push-test', $3)`,
    [groupId, tenantId, SYSTEM_USER_ID],
  );
  const planId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO planner.plans (id, tenant_id, group_id, name, external_source, external_id, created_by)
     VALUES ($1, $2, $3, 'Roadmap', 'm365', 'ext-plan-push-test', $4)`,
    [planId, tenantId, groupId, SYSTEM_USER_ID],
  );
  const taskId = crypto.randomUUID();
  return { tenantId, groupId, planId, taskId };
}

async function getEnqueuedJobs(
  pool: Pool,
): Promise<Array<{ identifier: string; payload: unknown }>> {
  const { rows } = await pool.query(`
    SELECT t.identifier, j.payload
    FROM graphile_worker._private_jobs j
    JOIN graphile_worker._private_tasks t ON t.id = j.task_id
    ORDER BY j.id
  `);
  return rows.map((r: { identifier: string; payload: unknown }) => ({
    identifier: r.identifier,
    payload: r.payload,
  }));
}

function makeTaskUpdatedEvent(opts: {
  tenantId: string;
  planId: string;
  taskId: string;
  groupId: string;
  changedFields: string[];
  actorType?: 'user' | 'system';
}) {
  const actor =
    opts.actorType === 'system'
      ? { type: 'system' as const, user_id: null, system_id: 'integrations.m365' as const }
      : { type: 'user' as const, user_id: SYSTEM_USER_ID };
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId: opts.tenantId,
    aggregateType: 'planner.task',
    aggregateId: opts.taskId,
    eventType: 'planner.task.updated',
    eventVersion: 1 as const,
    payload: {
      actor,
      group_id: opts.groupId,
      task_id: opts.taskId,
      plan_id: opts.planId,
      before: {},
      after: {},
      changed_fields: opts.changedFields,
      version_before: 1,
      version_after: 2,
    },
  };
}

async function withSetup<T>(
  fn: (ctx: {
    pool: Pool;
    tenantId: string;
    groupId: string;
    planId: string;
    taskId: string;
    db: NodePgDatabase<Record<string, never>>;
  }) => Promise<T>,
) {
  return withTestDb(
    {
      templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.SETA_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetIntegrationsDb();
      initPools({ databaseUrl });
      try {
        await installWorkerSchema(pool);
        const seeded = await seedLinkedPlan(pool);
        const db = drizzle(pool, { schema: {} });
        const groupRepo = createM365GroupLinkRepo({ db: db as never });
        await groupRepo.upsert({
          tenantId: seeded.tenantId,
          groupId: seeded.groupId,
          externalId: 'ext-grp-push-test',
          lastSyncedFields: {},
        });
        const planLinkRepo = createM365PlanLinkRepo({ db: db as never });
        await planLinkRepo.upsert({
          tenantId: seeded.tenantId,
          groupId: seeded.groupId,
          planId: seeded.planId,
          externalId: 'ext-plan-push-test',
          initialSnapshot: {},
        });
        return await fn({ pool, db, ...seeded });
      } finally {
        resetCoreDb();
        resetIntegrationsDb();
        await closePools();
      }
    },
  );
}

const allSubs = buildM365Subscribers();
const taskUpdatedSub = allSubs.find(
  (s) => s.event === 'planner.task.updated' && s.subscription.includes('plan.push.task-updated'),
);

if (!taskUpdatedSub) throw new Error('task-updated push subscriber not registered');

describe('plan-push subscribers', () => {
  it('echo-guard: M365 system actor → no push job enqueued', async () => {
    await withSetup(async ({ pool, tenantId, planId, taskId, groupId, db }) => {
      const event = makeTaskUpdatedEvent({
        tenantId,
        planId,
        taskId,
        groupId,
        changedFields: ['title'],
        actorType: 'system',
      });
      await db.transaction(async (tx) => taskUpdatedSub.handler(event, { tx: tx as never }));
      const jobs = await getEnqueuedJobs(pool);
      expect(jobs.filter((j) => j.identifier === 'm365.plan.push')).toHaveLength(0);
    });
  });

  it('human actor + linked plan → one push job enqueued with correct payload', async () => {
    await withSetup(async ({ pool, tenantId, planId, taskId, groupId, db }) => {
      const event = makeTaskUpdatedEvent({
        tenantId,
        planId,
        taskId,
        groupId,
        changedFields: ['title'],
      });
      await db.transaction(async (tx) => taskUpdatedSub.handler(event, { tx: tx as never }));
      const jobs = await getEnqueuedJobs(pool);
      const pushJobs = jobs.filter((j) => j.identifier === 'm365.plan.push');
      expect(pushJobs).toHaveLength(1);
      expect(pushJobs[0]?.payload).toMatchObject({
        tenant_id: tenantId,
        plan_id: planId,
        resource_type: 'task',
        seta_id: taskId,
        changed_fields: ['title'],
      });
    });
  });

  it('human actor + unlinked plan → no push job', async () => {
    await withSetup(async ({ pool, tenantId, groupId, db }) => {
      const event = makeTaskUpdatedEvent({
        tenantId,
        planId: crypto.randomUUID(), // not linked
        taskId: crypto.randomUUID(),
        groupId,
        changedFields: ['title'],
      });
      await db.transaction(async (tx) => taskUpdatedSub.handler(event, { tx: tx as never }));
      const jobs = await getEnqueuedJobs(pool);
      expect(jobs.filter((j) => j.identifier === 'm365.plan.push')).toHaveLength(0);
    });
  });

  it('task updated with no Graph-mapped fields → no push job', async () => {
    await withSetup(async ({ pool, tenantId, planId, taskId, groupId, db }) => {
      const event = makeTaskUpdatedEvent({
        tenantId,
        planId,
        taskId,
        groupId,
        changedFields: ['skill_tags', 'review_state'],
      });
      await db.transaction(async (tx) => taskUpdatedSub.handler(event, { tx: tx as never }));
      const jobs = await getEnqueuedJobs(pool);
      expect(jobs.filter((j) => j.identifier === 'm365.plan.push')).toHaveLength(0);
    });
  });

  it('subscriber registry contains the expected push subscribers (>=11)', () => {
    const pushSubs = allSubs.filter((s) =>
      s.subscription.startsWith('integrations.m365.plan.push.'),
    );
    expect(pushSubs.length).toBeGreaterThanOrEqual(11);
  });
});
