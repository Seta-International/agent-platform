import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import {
  addGroupMember,
  createGroup,
  createPlan,
  deletePlan,
  listGroupsWithCounts,
} from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

describe('listGroupsWithCounts', () => {
  it('returns groups with plan_count and member_count aggregates', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [
              { name: 'Bob', email: 'bob@example.test' },
              { name: 'Carol', email: 'carol@example.test' },
            ],
          });
          const session = seeded.adminSession;
          const [bob, carol] = seeded.users;
          if (!bob || !carol) throw new Error('seed failed: missing users');

          // Group with 2 plans and 2 added members
          const g1 = await createGroup({ tenant_id: seeded.tenant_id, name: 'Alpha', session });
          await createPlan({ group_id: g1.id, name: 'P1', session });
          await createPlan({ group_id: g1.id, name: 'P2', session });
          await addGroupMember({ group_id: g1.id, user_id: bob.user_id, session });
          await addGroupMember({ group_id: g1.id, user_id: carol.user_id, session });

          // Group with no plans or members
          const g2 = await createGroup({ tenant_id: seeded.tenant_id, name: 'Beta', session });

          // Group with one plan that's been soft-deleted (should not count)
          const g3 = await createGroup({ tenant_id: seeded.tenant_id, name: 'Gamma', session });
          const p3 = await createPlan({ group_id: g3.id, name: 'P3', session });
          await deletePlan({ plan_id: p3.id, expected_version: p3.version, session });

          const rows = await listGroupsWithCounts({ session });

          const a = rows.find((r) => r.id === g1.id);
          const b = rows.find((r) => r.id === g2.id);
          const c = rows.find((r) => r.id === g3.id);

          expect(a).toBeDefined();
          expect(a?.plan_count).toBe(2);
          expect(a?.member_count).toBe(2);

          // owner_display_name: admin has an assignee_projection row seeded by helpers.ts
          const adminProjection = await pool.query(
            'SELECT display_name FROM planner.assignee_projection WHERE user_id = $1',
            [seeded.admin.user_id],
          );
          expect(a?.owner_display_name).toBe(
            adminProjection.rows[0]?.display_name ?? seeded.admin.name,
          );

          expect(b).toBeDefined();
          expect(b?.plan_count).toBe(0);
          expect(b?.member_count).toBe(0);

          expect(c).toBeDefined();
          expect(c?.plan_count).toBe(0); // soft-deleted plan excluded
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('respects accessible-group filter for non-admins', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, {
            users: [{ name: 'Bob', email: 'bob@example.test' }],
          });
          const session = seeded.adminSession;
          const [bob] = seeded.users;
          if (!bob) throw new Error('seed failed: missing bob');

          const g1 = await createGroup({ tenant_id: seeded.tenant_id, name: 'Visible', session });
          await createGroup({ tenant_id: seeded.tenant_id, name: 'Invisible', session });

          // Non-admin Bob session that only sees g1
          const bobSession = buildSession({
            tenant_id: seeded.tenant_id,
            user_id: bob.user_id,
            roles: ['planner.viewer'],
            accessible_group_ids: [g1.id],
          });

          const rows = await listGroupsWithCounts({ session: bobSession });
          const ids = rows.map((r) => r.id);
          expect(ids).toContain(g1.id);
          expect(ids).toHaveLength(1);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });

  it('returns ISO string timestamps and numeric counts', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        resetCoreDb();
        initPools({ databaseUrl });
        try {
          const seeded = await seedTenant(pool, { users: [] });
          const session = seeded.adminSession;

          await createGroup({ tenant_id: seeded.tenant_id, name: 'Delta', session });

          const rows = await listGroupsWithCounts({ session });
          expect(rows.length).toBeGreaterThanOrEqual(1);

          const row = rows[0];
          if (!row) throw new Error('no rows');

          // Timestamps are ISO strings
          expect(typeof row.created_at).toBe('string');
          expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
          expect(typeof row.updated_at).toBe('string');

          // Counts are actual numbers, not strings
          expect(typeof row.plan_count).toBe('number');
          expect(typeof row.member_count).toBe('number');
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
