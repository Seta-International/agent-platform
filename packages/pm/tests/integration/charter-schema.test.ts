// packages/pm/tests/integration/charter-schema.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('charter schema', () => {
  it('inserts a charter and enforces status/methodology/pricing checks', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const accountId = acc.rows[0].id;

        const ins = await pool.query(
          `INSERT INTO pm.charter (tenant_id, account_id, name, pm_worker_id, methodology, pricing_model, status)
           VALUES ($1,$2,'Proj',$3,'scrum','fixed_price','submitted') RETURNING id, version`,
          [t.tenant_id, accountId, t.admin_user_id],
        );
        expect(ins.rows[0].version).toBe(1);

        await expect(
          pool.query(
            `INSERT INTO pm.charter (tenant_id, account_id, name, pm_worker_id, status)
             VALUES ($1,$2,'Bad',$3,'nonsense')`,
            [t.tenant_id, accountId, t.admin_user_id],
          ),
        ).rejects.toThrow();

        // new project columns exist
        const proj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, methodology, pricing_model, team_size, charter_id)
           VALUES ($1,$2,'P','kanban','time_materials',5,$3) RETURNING id`,
          [t.tenant_id, accountId, ins.rows[0].id],
        );
        const projectId = proj.rows[0].id;

        await pool.query(
          `INSERT INTO pm.project_access (tenant_id, project_id, worker_id, level)
           VALUES ($1,$2,$3,'owner')`,
          [t.tenant_id, projectId, t.admin_user_id],
        );
        await pool.query(
          `INSERT INTO pm.staffing_plan_line (tenant_id, project_id, role, effort_mm)
           VALUES ($1,$2,'Dev',1.5)`,
          [t.tenant_id, projectId],
        );
      } finally {
        resetPmDb();
        await closePools();
      }
    });
  });

  it('accepts pmo_approved status and rejects an invalid rejected_stage', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        await expect(
          pool.query(
            `INSERT INTO pm.charter (tenant_id, account_id, name, pm_worker_id, status)
             VALUES ($1,$2,'P',$3,'pmo_approved')`,
            [t.tenant_id, acc.rows[0].id, crypto.randomUUID()],
          ),
        ).resolves.toBeDefined();
        await expect(
          pool.query(
            `INSERT INTO pm.charter (tenant_id, account_id, name, pm_worker_id, status, rejected_stage)
             VALUES ($1,$2,'Q',$3,'rejected','nope')`,
            [t.tenant_id, acc.rows[0].id, crypto.randomUUID()],
          ),
        ).rejects.toThrow(/charter_rejected_stage_check/);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
