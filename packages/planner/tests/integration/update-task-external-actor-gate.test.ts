import type { SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { createGroup, createPlan, createTask, updateTask } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

function makeM365SystemSession(adminSession: SessionScope): SessionScope {
  return {
    ...adminSession,
    actor: { kind: 'system', system_id: 'integrations.m365' },
  } as SessionScope;
}

describe('updateTask external-actor gate', () => {
  it('rejects external_id from human session with RESERVED_FOR_SYSTEM_ACTOR', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await expect(
            updateTask({
              task_id: task.id,
              expected_version: 1,
              patch: { external_source: 'm365', external_id: 'abc' },
              session,
            }),
          ).rejects.toMatchObject({ code: 'RESERVED_FOR_SYSTEM_ACTOR' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects external_etag from human session', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await expect(
            updateTask({
              task_id: task.id,
              expected_version: 1,
              patch: { external_etag: 'etag-1' },
              session,
            }),
          ).rejects.toMatchObject({ code: 'RESERVED_FOR_SYSTEM_ACTOR' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('rejects external_synced_at from human session', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await expect(
            updateTask({
              task_id: task.id,
              expected_version: 1,
              patch: { external_synced_at: '2026-05-01T00:00:00.000Z' },
              session,
            }),
          ).rejects.toMatchObject({ code: 'RESERVED_FOR_SYSTEM_ACTOR' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('accepts external_id + external_source from M365 system actor', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          const systemSession = makeM365SystemSession(session);
          const updated = await updateTask({
            task_id: task.id,
            expected_version: 1,
            patch: { external_source: 'm365', external_id: 'abc-123' },
            session: systemSession,
          });

          expect(updated.external_source).toBe('m365');
          expect(updated.external_id).toBe('abc-123');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('system actor can also update non-external fields in same patch', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'Original', session });

          const systemSession = makeM365SystemSession(session);
          const updated = await updateTask({
            task_id: task.id,
            expected_version: 1,
            patch: { title: 'new', external_source: 'm365', external_id: 'x' },
            session: systemSession,
          });

          expect(updated.title).toBe('new');
          expect(updated.external_source).toBe('m365');
          expect(updated.external_id).toBe('x');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('human session can still update non-external fields', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'Original', session });

          const updated = await updateTask({
            task_id: task.id,
            expected_version: 1,
            patch: { title: 'new' },
            session,
          });

          expect(updated.title).toBe('new');
          expect(updated.version).toBe(2);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('unknown / legacy field `priority` still rejected by Zod strict parse', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const session = seeded.adminSession;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'T', session });

          await expect(
            updateTask({
              task_id: task.id,
              expected_version: 1,
              // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input
              patch: { priority: 'urgent' } as any,
              session,
            }),
          ).rejects.toMatchObject({ code: 'VALIDATION' });
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
