import { emitContext } from '@seta/core/events';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import * as schema from '../../../src/backend/db/schema.ts';
import {
  handleGroupMemberRoleChanged,
  handleTaskAssigned,
  handleTaskCompleted,
  handleTaskCreated,
  handleTaskReopened,
} from '../../../src/backend/subscribers/notification-trigger.ts';
import { addGroupMember, createGroup, createPlan, createTask } from '../../../src/index.ts';
import { readEvents, seedTenant } from '../../helpers.ts';

const BASE_URL = process.env.PLATFORM_TEST_PG_BASE as string;
const TEMPLATE = process.env.PLATFORM_TEST_PG_TEMPLATE as string;

describe('Planner notification subscribers', () => {
  it('handleTaskCreated notifies all group members except actor', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const session = seeded.adminSession;
          const alice = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });

          const taskId = crypto.randomUUID();
          const eventId = crypto.randomUUID();

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            await emitContext.run({ tx: tx as never }, async () => {
              await handleTaskCreated(
                {
                  id: eventId,
                  occurredAt: new Date(),
                  tenantId: seeded.tenant_id,
                  aggregateType: 'planner.task',
                  aggregateId: taskId,
                  eventType: 'planner.task.created',
                  eventVersion: 1,
                  payload: {
                    actor: { type: 'user', user_id: session.user_id },
                    group_id: group.id,
                    after: {
                      task_id: taskId,
                      plan_id: plan.id,
                      group_id: group.id,
                      bucket_id: null,
                      title: 'New Feature',
                      description: null,
                      priority_number: 5,
                      percent_complete: 0,
                      is_deferred: false,
                      preview_type: 'automatic',
                      start_at: null,
                      due_at: null,
                      order_hint: null,
                      assignee_priority: null,
                      review_state: null,
                      external_source: 'native',
                      external_id: null,
                      created_by: session.user_id,
                    },
                  },
                },
                { tx: tx as never },
              );
            });
          });

          const notifEvents = await readEvents(pool, seeded.tenant_id, 'notification.requested');
          expect(notifEvents).toHaveLength(1);
          const payload = notifEvents[0]!.payload as Record<string, unknown>;
          expect(payload.target_event_type).toBe('planner.task.created');
          expect(payload.user_ids).toEqual([alice.user_id]);
          expect((payload.target_payload as Record<string, unknown>).title).toBe(
            'Task created: New Feature',
          );
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('handleTaskCompleted notifies group members except actor', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const session = seeded.adminSession;
          const alice = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'Bug Fix', session });
          await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });

          const eventId = crypto.randomUUID();
          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            await emitContext.run({ tx: tx as never }, async () => {
              await handleTaskCompleted(
                {
                  id: eventId,
                  occurredAt: new Date(),
                  tenantId: seeded.tenant_id,
                  aggregateType: 'planner.task',
                  aggregateId: task.id,
                  eventType: 'planner.task.completed',
                  eventVersion: 1,
                  payload: {
                    actor: { type: 'user', user_id: session.user_id },
                    group_id: group.id,
                    task_id: task.id,
                    plan_id: plan.id,
                    version_before: 1,
                    version_after: 2,
                    completed_at: new Date().toISOString(),
                  },
                },
                { tx: tx as never },
              );
            });
          });

          const notifEvents = await readEvents(pool, seeded.tenant_id, 'notification.requested');
          expect(notifEvents).toHaveLength(1);
          const payload = notifEvents[0]!.payload as Record<string, unknown>;
          expect(payload.target_event_type).toBe('planner.task.completed');
          expect(payload.user_ids).toEqual([alice.user_id]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('handleTaskReopened notifies group members except actor', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const session = seeded.adminSession;
          const alice = seeded.users[0]!;

          const group = await createGroup({ tenant_id: seeded.tenant_id, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task = await createTask({ plan_id: plan.id, title: 'Bug Fix', session });
          await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });

          const eventId = crypto.randomUUID();
          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            await emitContext.run({ tx: tx as never }, async () => {
              await handleTaskReopened(
                {
                  id: eventId,
                  occurredAt: new Date(),
                  tenantId: seeded.tenant_id,
                  aggregateType: 'planner.task',
                  aggregateId: task.id,
                  eventType: 'planner.task.reopened',
                  eventVersion: 1,
                  payload: {
                    actor: { type: 'user', user_id: session.user_id },
                    group_id: group.id,
                    task_id: task.id,
                    plan_id: plan.id,
                    version_before: 2,
                    version_after: 3,
                  },
                },
                { tx: tx as never },
              );
            });
          });

          const notifEvents = await readEvents(pool, seeded.tenant_id, 'notification.requested');
          expect(notifEvents).toHaveLength(1);
          const payload = notifEvents[0]!.payload as Record<string, unknown>;
          expect(payload.target_event_type).toBe('planner.task.reopened');
          expect(payload.user_ids).toEqual([alice.user_id]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('handleTaskAssigned notifies assigned user', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const alice = seeded.users[0]!;
          const eventId = crypto.randomUUID();
          const taskId = crypto.randomUUID();
          const planId = crypto.randomUUID();
          const groupId = crypto.randomUUID();

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            await emitContext.run({ tx: tx as never }, async () => {
              await handleTaskAssigned(
                {
                  id: eventId,
                  occurredAt: new Date(),
                  tenantId: seeded.tenant_id,
                  aggregateType: 'planner.task',
                  aggregateId: taskId,
                  eventType: 'planner.task.assigned',
                  eventVersion: 1,
                  payload: {
                    actor: { type: 'user', user_id: seeded.adminSession.user_id },
                    group_id: groupId,
                    task_id: taskId,
                    plan_id: planId,
                    user_id: alice.user_id,
                  },
                },
                { tx: tx as never },
              );
            });
          });

          const notifEvents = await readEvents(pool, seeded.tenant_id, 'notification.requested');
          expect(notifEvents).toHaveLength(1);
          const payload = notifEvents[0]!.payload as Record<string, unknown>;
          expect(payload.target_event_type).toBe('planner.task.assigned');
          expect(payload.user_ids).toEqual([alice.user_id]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('handleGroupMemberRoleChanged notifies user whose role changed', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });
          const alice = seeded.users[0]!;
          const eventId = crypto.randomUUID();
          const groupId = crypto.randomUUID();

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            await emitContext.run({ tx: tx as never }, async () => {
              await handleGroupMemberRoleChanged(
                {
                  id: eventId,
                  occurredAt: new Date(),
                  tenantId: seeded.tenant_id,
                  aggregateType: 'planner.group',
                  aggregateId: groupId,
                  eventType: 'planner.group.member.role-changed',
                  eventVersion: 1,
                  payload: {
                    actor: { type: 'user', user_id: seeded.adminSession.user_id },
                    group_id: groupId,
                    user_id: alice.user_id,
                    before_role: 'member',
                    after_role: 'owner',
                  },
                },
                { tx: tx as never },
              );
            });
          });

          const notifEvents = await readEvents(pool, seeded.tenant_id, 'notification.requested');
          expect(notifEvents).toHaveLength(1);
          const payload = notifEvents[0]!.payload as Record<string, unknown>;
          expect(payload.target_event_type).toBe('planner.group.member.role-changed');
          expect(payload.user_ids).toEqual([alice.user_id]);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
