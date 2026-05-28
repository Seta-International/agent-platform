import { emitContext } from '@seta/core/events';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import * as schema from '../../src/backend/db/schema.ts';
import {
  applyDeactivated,
  applyEmailChanged,
  applyProfileUpdated,
  applyUserCreated,
} from '../../src/backend/subscribers/identity-projection.ts';
import { assignTask, createGroup, createPlan, createTask } from '../../src/index.ts';
import { readEvents, seedTenant } from '../helpers.ts';

const BASE_URL = process.env.PLATFORM_TEST_PG_BASE as string;
const TEMPLATE = process.env.PLATFORM_TEST_PG_TEMPLATE as string;

// ---------------------------------------------------------------------------
// applyUserCreated
// ---------------------------------------------------------------------------

describe('applyUserCreated', () => {
  it('inserts a projection row for a new user', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();

          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantId,
            'Evt Tenant',
            `evt-${tenantId.slice(0, 8)}`,
          ]);

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            const fakeTx = tx as unknown as Parameters<typeof applyUserCreated>[1]['tx'];
            await applyUserCreated(
              {
                id: crypto.randomUUID(),
                occurredAt: new Date(),
                tenantId,
                aggregateType: 'identity.user',
                aggregateId: userId,
                eventType: 'identity.user.created',
                eventVersion: 1,
                payload: {
                  actor: { type: 'cli', user_id: null },
                  after: {
                    user_id: userId,
                    tenant_id: tenantId,
                    email: 'alice@example.test',
                    name: 'Alice',
                    created_via: 'admin',
                  },
                },
              },
              { tx: fakeTx },
            );
          });

          const { rows } = await pool.query(
            `SELECT user_id, display_name, email, availability_status FROM planner.assignee_projection WHERE user_id = $1`,
            [userId],
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].display_name).toBe('Alice');
          expect(rows[0].email).toBe('alice@example.test');
          expect(rows[0].availability_status).toBe('available');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is idempotent: second call with same user_id is a no-op', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();

          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantId,
            'Evt Tenant 2',
            `evt-${tenantId.slice(0, 8)}`,
          ]);

          const db = drizzle(pool, { schema });

          const makeEvent = () => ({
            id: crypto.randomUUID(),
            occurredAt: new Date(),
            tenantId,
            aggregateType: 'identity.user',
            aggregateId: userId,
            eventType: 'identity.user.created',
            eventVersion: 1 as const,
            payload: {
              actor: { type: 'cli' as const, user_id: null },
              after: {
                user_id: userId,
                tenant_id: tenantId,
                email: 'bob@example.test',
                name: 'Bob',
                created_via: 'admin' as const,
              },
            },
          });

          await db.transaction(async (tx) => {
            const fakeTx = tx as unknown as Parameters<typeof applyUserCreated>[1]['tx'];
            await applyUserCreated(makeEvent(), { tx: fakeTx });
            // Second delivery — must not throw
            await applyUserCreated(makeEvent(), { tx: fakeTx });
          });

          const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM planner.assignee_projection WHERE user_id = $1`,
            [userId],
          );
          expect(rows[0].n).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('preserves profile fields when profile update is processed before user created', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();

          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantId,
            'Evt Tenant 3',
            `evt-${tenantId.slice(0, 8)}`,
          ]);

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            const profileTx = tx as unknown as Parameters<typeof applyProfileUpdated>[1]['tx'];
            const createTx = tx as unknown as Parameters<typeof applyUserCreated>[1]['tx'];
            await applyProfileUpdated(
              {
                id: crypto.randomUUID(),
                occurredAt: new Date(),
                tenantId,
                aggregateType: 'identity.user',
                aggregateId: userId,
                eventType: 'identity.user.profile.updated',
                eventVersion: 1,
                payload: {
                  actor: { type: 'cli', user_id: null },
                  user_id: userId,
                  before: { skills: [] },
                  after: {
                    skills: ['aws', 'kubernetes'],
                    availability_status: 'busy',
                    timezone: 'Asia/Ho_Chi_Minh',
                  },
                },
              },
              { tx: profileTx },
            );
            await applyUserCreated(
              {
                id: crypto.randomUUID(),
                occurredAt: new Date(),
                tenantId,
                aggregateType: 'identity.user',
                aggregateId: userId,
                eventType: 'identity.user.created',
                eventVersion: 1,
                payload: {
                  actor: { type: 'cli', user_id: null },
                  after: {
                    user_id: userId,
                    tenant_id: tenantId,
                    email: 'out-of-order@example.test',
                    name: 'Out Of Order',
                    created_via: 'admin',
                  },
                },
              },
              { tx: createTx },
            );
          });

          const { rows } = await pool.query(
            `SELECT display_name, email, skills, availability_status, timezone
               FROM planner.assignee_projection WHERE user_id = $1`,
            [userId],
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].display_name).toBe('Out Of Order');
          expect(rows[0].email).toBe('out-of-order@example.test');
          expect(rows[0].skills).toEqual(['aws', 'kubernetes']);
          expect(rows[0].availability_status).toBe('busy');
          expect(rows[0].timezone).toBe('Asia/Ho_Chi_Minh');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// applyProfileUpdated
// ---------------------------------------------------------------------------

describe('applyProfileUpdated', () => {
  it('updates only projected fields present in the patch', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const userId = seeded.admin.user_id;
          const tenantId = seeded.tenant_id;

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            const fakeTx = tx as unknown as Parameters<typeof applyProfileUpdated>[1]['tx'];
            await applyProfileUpdated(
              {
                id: crypto.randomUUID(),
                occurredAt: new Date(),
                tenantId,
                aggregateType: 'identity.user',
                aggregateId: userId,
                eventType: 'identity.user.profile.updated',
                eventVersion: 1,
                payload: {
                  actor: { type: 'user', user_id: userId },
                  user_id: userId,
                  before: { display_name: 'Test Admin' },
                  after: { display_name: 'Alice Updated', availability_status: 'busy' },
                },
              },
              { tx: fakeTx },
            );
          });

          const { rows } = await pool.query(
            `SELECT display_name, availability_status, email FROM planner.assignee_projection WHERE user_id = $1`,
            [userId],
          );
          expect(rows[0].display_name).toBe('Alice Updated');
          expect(rows[0].availability_status).toBe('busy');
          // email was not in the patch — unchanged
          expect(rows[0].email).toBe(seeded.admin.email);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('is a no-op when no projected fields are present', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const userId = seeded.admin.user_id;
          const tenantId = seeded.tenant_id;

          // Record the current projection_built_at
          const { rows: before } = await pool.query(
            `SELECT projection_built_at FROM planner.assignee_projection WHERE user_id = $1`,
            [userId],
          );

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            const fakeTx = tx as unknown as Parameters<typeof applyProfileUpdated>[1]['tx'];
            await applyProfileUpdated(
              {
                id: crypto.randomUUID(),
                occurredAt: new Date(),
                tenantId,
                aggregateType: 'identity.user',
                aggregateId: userId,
                eventType: 'identity.user.profile.updated',
                eventVersion: 1,
                payload: {
                  actor: { type: 'user', user_id: userId },
                  user_id: userId,
                  before: {},
                  // 'after' only has a non-projected field (not in our handled set)
                  after: {},
                },
              },
              { tx: fakeTx },
            );
          });

          const { rows: after } = await pool.query(
            `SELECT projection_built_at FROM planner.assignee_projection WHERE user_id = $1`,
            [userId],
          );
          // projection_built_at should be unchanged since no projected fields
          expect(after[0].projection_built_at).toEqual(before[0].projection_built_at);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// applyEmailChanged
// ---------------------------------------------------------------------------

describe('applyEmailChanged', () => {
  it('updates email only', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool);
          const userId = seeded.admin.user_id;
          const tenantId = seeded.tenant_id;

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            const fakeTx = tx as unknown as Parameters<typeof applyEmailChanged>[1]['tx'];
            await applyEmailChanged(
              {
                id: crypto.randomUUID(),
                occurredAt: new Date(),
                tenantId,
                aggregateType: 'identity.user',
                aggregateId: userId,
                eventType: 'identity.user.email.changed',
                eventVersion: 1,
                payload: {
                  actor: { type: 'user', user_id: userId },
                  user_id: userId,
                  tenant_id: tenantId,
                  old_email: seeded.admin.email,
                  new_email: 'newemail@example.test',
                  reason: 'admin',
                },
              },
              { tx: fakeTx },
            );
          });

          const { rows } = await pool.query(
            `SELECT email, display_name FROM planner.assignee_projection WHERE user_id = $1`,
            [userId],
          );
          expect(rows[0].email).toBe('newemail@example.test');
          // display_name untouched
          expect(rows[0].display_name).toBe(seeded.admin.name);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// applyDeactivated
// ---------------------------------------------------------------------------

describe('applyDeactivated', () => {
  it('marks projection deactivated, removes task_assignments, and emits planner.task.unassigned per dropped assignment', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Dave', email: 'dave@example.test' }],
          });
          const session = seeded.adminSession;
          const dave = seeded.users[0]!;
          const tenantId = seeded.tenant_id;

          // Create a group, plan, and two tasks, then assign dave to both.
          const group = await createGroup({ tenant_id: tenantId, name: 'Eng', session });
          const plan = await createPlan({ group_id: group.id, name: 'Sprint 1', session });
          const task1 = await createTask({ plan_id: plan.id, title: 'T1', session });
          const task2 = await createTask({ plan_id: plan.id, title: 'T2', session });

          await assignTask({ task_id: task1.id, user_id: dave.user_id, session });
          await assignTask({ task_id: task2.id, user_id: dave.user_id, session });

          const deactivatedAt = new Date().toISOString();

          const db = drizzle(pool, { schema });
          // The deactivated handler emits events, so we need to run it inside an emitContext.
          // emitContext stores a NodeTx (drizzle tx) used by emit() to insert into core.events.
          await db.transaction(async (tx) => {
            const fakeTx = tx as unknown as Parameters<typeof applyDeactivated>[1]['tx'];
            await emitContext.run({ tx: fakeTx }, async () => {
              await applyDeactivated(
                {
                  id: crypto.randomUUID(),
                  occurredAt: new Date(),
                  tenantId,
                  aggregateType: 'identity.user',
                  aggregateId: dave.user_id,
                  eventType: 'identity.user.deactivated',
                  eventVersion: 1,
                  payload: {
                    actor: { type: 'user', user_id: seeded.admin.user_id },
                    user_id: dave.user_id,
                    tenant_id: tenantId,
                    deactivated_at: deactivatedAt,
                  },
                },
                { tx: fakeTx },
              );
            });
          });

          // Projection should be deactivated
          const { rows: proj } = await pool.query(
            `SELECT deactivated_at FROM planner.assignee_projection WHERE user_id = $1`,
            [dave.user_id],
          );
          expect(proj).toHaveLength(1);
          expect(proj[0].deactivated_at).not.toBeNull();

          // All task_assignments for dave should be removed
          const { rows: assignments } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM planner.task_assignments WHERE user_id = $1`,
            [dave.user_id],
          );
          expect(assignments[0].n).toBe(0);

          // One planner.task.unassigned event per dropped assignment, with actor.type='system'
          const unassignedEvents = await readEvents(pool, tenantId, 'planner.task.unassigned');
          // Filter to those emitted by the system (from deactivation, not from the assignTask setup)
          const systemUnassignEvents = unassignedEvents.filter((ev) => {
            const p = ev.payload as Record<string, unknown>;
            const actor = p.actor as Record<string, unknown> | undefined;
            return actor?.type === 'system';
          });
          expect(systemUnassignEvents).toHaveLength(2);

          const taskIds = systemUnassignEvents
            .map((ev) => (ev.payload as Record<string, unknown>).task_id as string)
            .sort();
          expect(taskIds).toEqual([task1.id, task2.id].sort());

          for (const ev of systemUnassignEvents) {
            const p = ev.payload as Record<string, unknown>;
            const actor = p.actor as Record<string, unknown>;
            expect(actor.user_id).toBeNull();
            expect(p.user_id).toBe(dave.user_id);
            expect(p.plan_id).toBe(plan.id);
            expect(p.group_id).toBe(group.id);
          }
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
