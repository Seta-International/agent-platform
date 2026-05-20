import { resetCoreDb } from '@seta/core/internal/test-support';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { seedTenant } from './helpers.ts';

describe('planner test harness smoke', () => {
  it('seeds a tenant + users + admin session', async () => {
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
            users: [{ name: 'Alice', email: 'alice@example.test' }],
          });

          expect(seeded.tenant_id).toBeTypeOf('string');
          expect(seeded.admin.user_id).toBeTypeOf('string');
          expect(seeded.users).toHaveLength(1);
          expect(seeded.users[0]?.name).toBe('Alice');
          expect(seeded.adminSession.tenant_id).toBe(seeded.tenant_id);
          expect(seeded.adminSession.role_summary.roles).toContain('org.admin');

          const r = await pool.query(
            `SELECT user_id FROM planner.assignee_projection WHERE tenant_id = $1`,
            [seeded.tenant_id],
          );
          expect(r.rows).toHaveLength(2);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
