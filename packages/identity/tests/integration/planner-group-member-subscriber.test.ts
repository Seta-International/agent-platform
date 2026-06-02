import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

// ── helpers ──────────────────────────────────────────────────────────────────

async function insertRoleGrant(
  pool: import('pg').Pool,
  opts: {
    tenant_id: string;
    user_id: string;
    group_id: string;
    granted_by?: string;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO identity.role_grants (id, tenant_id, user_id, role_slug, scope_type, scope_id, granted_by, granted_via)
     VALUES ($1,$2,$3,'planner.viewer','group',$4,$5,'admin')`,
    [id, opts.tenant_id, opts.user_id, opts.group_id, opts.granted_by ?? null],
  );
  return id;
}

async function getRoleGrant(
  pool: import('pg').Pool,
  userId: string,
  groupId: string,
): Promise<{ id: string; revoked_at: string | null } | null> {
  const res = await pool.query(
    `SELECT id, revoked_at FROM identity.role_grants
     WHERE user_id=$1 AND scope_type='group' AND scope_id=$2`,
    [userId, groupId],
  );
  return res.rows[0] ?? null;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('identity: planner-group-member subscriber', () => {
  it('PlannerGroupMemberAdded → inserts planner.viewer role grant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          const groupId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants(id,name,slug) VALUES($1,$2,$3)`, [
            tenantId,
            'T',
            `slug-${tenantId.slice(0, 8)}`,
          ]);

          const eventId = crypto.randomUUID();

          const { applyMemberAdded } = await import(
            '../../src/backend/subscribers/planner-group-member.ts'
          );
          const { getPool } = await import('@seta/shared-db');
          const client = await getPool().connect();
          try {
            await client.query('BEGIN');
            await applyMemberAdded(
              {
                id: eventId,
                tenantId,
                aggregateType: 'planner.group',
                aggregateId: groupId,
                eventType: 'planner.group.member.added',
                eventVersion: 1,
                occurredAt: new Date(),
                payload: {
                  actor: { type: 'user', user_id: userId },
                  group_id: groupId,
                  user_id: userId,
                  tenant_id: tenantId,
                },
              },
              { tx: client as never },
            );
            await client.query('COMMIT');
          } finally {
            client.release();
          }

          const grant = await getRoleGrant(pool, userId, groupId);
          expect(grant).not.toBeNull();
          expect(grant?.revoked_at).toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('PlannerGroupMemberAdded is idempotent on replay', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          const groupId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants(id,name,slug) VALUES($1,$2,$3)`, [
            tenantId,
            'T',
            `slug-${tenantId.slice(0, 8)}`,
          ]);

          // Pre-existing grant
          await insertRoleGrant(pool, { tenant_id: tenantId, user_id: userId, group_id: groupId });

          const { applyMemberAdded } = await import(
            '../../src/backend/subscribers/planner-group-member.ts'
          );
          const { getPool } = await import('@seta/shared-db');
          const client = await getPool().connect();
          try {
            await client.query('BEGIN');
            await applyMemberAdded(
              {
                id: crypto.randomUUID(),
                tenantId,
                aggregateType: 'planner.group',
                aggregateId: groupId,
                eventType: 'planner.group.member.added',
                eventVersion: 1,
                occurredAt: new Date(),
                payload: {
                  actor: { type: 'user', user_id: userId },
                  group_id: groupId,
                  user_id: userId,
                  tenant_id: tenantId,
                },
              },
              { tx: client as never },
            );
            await client.query('COMMIT');
          } finally {
            client.release();
          }

          const res = await pool.query(
            `SELECT COUNT(*) FROM identity.role_grants WHERE user_id=$1 AND scope_type='group' AND scope_id=$2 AND revoked_at IS NULL`,
            [userId, groupId],
          );
          expect(Number(res.rows[0].count)).toBe(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('PlannerGroupMemberRemoved → revokes the role grant', async () => {
    await withTestDb(
      {
        templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const tenantId = crypto.randomUUID();
          const userId = crypto.randomUUID();
          const groupId = crypto.randomUUID();
          await pool.query(`INSERT INTO core.tenants(id,name,slug) VALUES($1,$2,$3)`, [
            tenantId,
            'T',
            `slug-${tenantId.slice(0, 8)}`,
          ]);

          await insertRoleGrant(pool, { tenant_id: tenantId, user_id: userId, group_id: groupId });

          const { applyMemberRemoved } = await import(
            '../../src/backend/subscribers/planner-group-member.ts'
          );
          const { getPool } = await import('@seta/shared-db');
          const client = await getPool().connect();
          try {
            await client.query('BEGIN');
            await applyMemberRemoved(
              {
                id: crypto.randomUUID(),
                tenantId,
                aggregateType: 'planner.group',
                aggregateId: groupId,
                eventType: 'planner.group.member.removed',
                eventVersion: 1,
                occurredAt: new Date(),
                payload: {
                  actor: { type: 'user', user_id: userId },
                  group_id: groupId,
                  user_id: userId,
                  tenant_id: tenantId,
                },
              },
              { tx: client as never },
            );
            await client.query('COMMIT');
          } finally {
            client.release();
          }

          const grant = await getRoleGrant(pool, userId, groupId);
          expect(grant?.revoked_at).not.toBeNull();
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
