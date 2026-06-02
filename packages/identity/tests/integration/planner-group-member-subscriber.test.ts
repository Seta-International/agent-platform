import { emitContext } from '@seta/core/events';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import * as schema from '../../src/backend/db/schema.ts';
import {
  applyMemberAdded,
  applyMemberRemoved,
} from '../../src/backend/subscribers/planner-group-member.ts';

const BASE_URL = process.env.PLATFORM_TEST_PG_BASE as string;
const TEMPLATE = process.env.PLATFORM_TEST_PG_TEMPLATE as string;

describe('applyMemberAdded', () => {
  it('inserts a planner.viewer role grant in identity.role_grants', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          const groupId = crypto.randomUUID();
          const actorId = crypto.randomUUID();
          const eventId = crypto.randomUUID();

          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantId,
            'Subscriber Tenant',
            `sub-${tenantId.slice(0, 8)}`,
          ]);

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            await emitContext.run(
              { tx: tx as never, causedByEventId: eventId, traceId: undefined },
              () =>
                applyMemberAdded(
                  {
                    id: eventId,
                    occurredAt: new Date(),
                    tenantId,
                    aggregateType: 'planner.group',
                    aggregateId: groupId,
                    eventType: 'planner.group.member.added',
                    eventVersion: 1,
                    payload: {
                      actor: { type: 'user', user_id: actorId },
                      group_id: groupId,
                      user_id: userId,
                    },
                  },
                  { tx: tx as never },
                ),
            );
          });

          const { rows } = await pool.query(
            `SELECT role_slug, scope_type, scope_id, revoked_at
           FROM identity.role_grants
           WHERE user_id = $1 AND scope_type = 'group' AND scope_id = $2`,
            [userId, groupId],
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].role_slug).toBe('planner.viewer');
          expect(rows[0].revoked_at).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('emits identity.role_grant.changed so existing session caches are invalidated', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          const groupId = crypto.randomUUID();
          const actorId = crypto.randomUUID();
          const eventId = crypto.randomUUID();

          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantId,
            'Cache Tenant',
            `cache-${tenantId.slice(0, 8)}`,
          ]);

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            await emitContext.run(
              { tx: tx as never, causedByEventId: eventId, traceId: undefined },
              () =>
                applyMemberAdded(
                  {
                    id: eventId,
                    occurredAt: new Date(),
                    tenantId,
                    aggregateType: 'planner.group',
                    aggregateId: groupId,
                    eventType: 'planner.group.member.added',
                    eventVersion: 1,
                    payload: {
                      actor: { type: 'user', user_id: actorId },
                      group_id: groupId,
                      user_id: userId,
                    },
                  },
                  { tx: tx as never },
                ),
            );
          });

          const { rows } = await pool.query(
            `SELECT event_type, payload FROM core.events WHERE event_type = 'identity.role_grant.changed' AND tenant_id = $1`,
            [tenantId],
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].payload.user_id).toBe(userId);
          expect(rows[0].payload.change).toBe('granted');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});

describe('applyMemberRemoved', () => {
  it('emits identity.role_grant.changed so access is revoked from existing sessions', async () => {
    await withTestDb(
      { templateDbName: TEMPLATE, baseUrl: BASE_URL },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          const groupId = crypto.randomUUID();
          const actorId = crypto.randomUUID();
          const eventId = crypto.randomUUID();

          await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, $2, $3)`, [
            tenantId,
            'Remove Tenant',
            `rem-${tenantId.slice(0, 8)}`,
          ]);
          await pool.query(
            `INSERT INTO identity.role_grants (id, tenant_id, user_id, role_slug, scope_type, scope_id, granted_by, granted_via)
           VALUES (gen_random_uuid(), $1, $2, 'planner.viewer', 'group', $3, $4, 'admin')`,
            [tenantId, userId, groupId, actorId],
          );

          const db = drizzle(pool, { schema });
          await db.transaction(async (tx) => {
            await emitContext.run(
              { tx: tx as never, causedByEventId: eventId, traceId: undefined },
              () =>
                applyMemberRemoved(
                  {
                    id: eventId,
                    occurredAt: new Date(),
                    tenantId,
                    aggregateType: 'planner.group',
                    aggregateId: groupId,
                    eventType: 'planner.group.member.removed',
                    eventVersion: 1,
                    payload: {
                      actor: { type: 'user', user_id: actorId },
                      group_id: groupId,
                      user_id: userId,
                    },
                  },
                  { tx: tx as never },
                ),
            );
          });

          const { rows } = await pool.query(
            `SELECT event_type, payload FROM core.events WHERE event_type = 'identity.role_grant.changed' AND tenant_id = $1`,
            [tenantId],
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].payload.user_id).toBe(userId);
          expect(rows[0].payload.change).toBe('revoked');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
