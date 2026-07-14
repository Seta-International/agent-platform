import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

// Inserts an account + project and returns the project id, so report FKs resolve.
async function seedProject(pool: Pool, tenantId: string): Promise<string> {
  const accountId = crypto.randomUUID();
  await pool.query(`INSERT INTO pm.account (id, tenant_id, name) VALUES ($1,$2,'Acct')`, [
    accountId,
    tenantId,
  ]);
  const projectId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pm.project (id, tenant_id, account_id, name) VALUES ($1,$2,$3,'Proj')`,
    [projectId, tenantId, accountId],
  );
  return projectId;
}

describe('pm weekly-report schema', () => {
  it('rejects a duplicate report identity (project, week, reporter)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reporterId = crypto.randomUUID();
        const ins = `INSERT INTO pm.report (tenant_id, project_id, week_start, reporter_id)
                     VALUES ($1,$2,'2026-07-13',$3)`;
        await pool.query(ins, [t.tenant_id, projectId, reporterId]);
        await expect(pool.query(ins, [t.tenant_id, projectId, reporterId])).rejects.toThrow();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a duplicate metric value (report, metric)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.report (id, tenant_id, project_id, week_start, reporter_id)
           VALUES ($1,$2,$3,'2026-07-13',$4)`,
          [reportId, t.tenant_id, projectId, crypto.randomUUID()],
        );
        const metricId = crypto.randomUUID();
        const ins = `INSERT INTO pm.metric_value (tenant_id, report_id, metric_id, raw_value)
                     VALUES ($1,$2,$3, 1.5)`;
        await pool.query(ins, [t.tenant_id, reportId, metricId]);
        await expect(pool.query(ins, [t.tenant_id, reportId, metricId])).rejects.toThrow();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a stale version-token write (optimistic concurrency)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.report (id, tenant_id, project_id, week_start, reporter_id)
           VALUES ($1,$2,$3,'2026-07-13',$4)`,
          [reportId, t.tenant_id, projectId, crypto.randomUUID()],
        );
        // Bump version to 2.
        await pool.query(
          `UPDATE pm.report SET version = version + 1 WHERE id = $1 AND version = 1`,
          [reportId],
        );
        // A writer holding the stale version 1 updates 0 rows.
        const stale = await pool.query(
          `UPDATE pm.report SET status = 'submitted', version = version + 1
           WHERE id = $1 AND version = 1`,
          [reportId],
        );
        expect(stale.rowCount).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('caps flags at one per QCDP category per report (four total)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.report (id, tenant_id, project_id, week_start, reporter_id)
           VALUES ($1,$2,$3,'2026-07-13',$4)`,
          [reportId, t.tenant_id, projectId, crypto.randomUUID()],
        );
        const ins = `INSERT INTO pm.flag (tenant_id, report_id, category, computed_colour, final_colour)
                     VALUES ($1,$2,$3,'green','green')`;
        for (const cat of ['quality', 'cost', 'delivery', 'performance']) {
          await pool.query(ins, [t.tenant_id, reportId, cat]);
        }
        // A second 'quality' flag on the same report is rejected.
        await expect(pool.query(ins, [t.tenant_id, reportId, 'quality'])).rejects.toThrow();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('cascades flag_audit_entry when its report is deleted', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.report (id, tenant_id, project_id, week_start, reporter_id)
           VALUES ($1,$2,$3,'2026-07-13',$4)`,
          [reportId, t.tenant_id, projectId, crypto.randomUUID()],
        );
        const flagId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.flag (id, tenant_id, report_id, category, computed_colour, final_colour)
           VALUES ($1,$2,$3,'quality','red','red')`,
          [flagId, t.tenant_id, reportId],
        );
        await pool.query(
          `INSERT INTO pm.flag_audit_entry (tenant_id, flag_id, to_colour) VALUES ($1,$2,'red')`,
          [t.tenant_id, flagId],
        );
        await pool.query(`DELETE FROM pm.report WHERE id = $1`, [reportId]);
        const remaining = await pool.query(`SELECT 1 FROM pm.flag_audit_entry WHERE flag_id = $1`, [
          flagId,
        ]);
        expect(remaining.rowCount).toBe(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
