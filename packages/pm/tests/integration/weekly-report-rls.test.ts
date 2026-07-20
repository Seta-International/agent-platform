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

describe('pm weekly-report platform invariants', () => {
  // The test connection is a superuser, which bypasses RLS regardless of FORCE, so we cannot
  // observe enforcement via a raw SELECT (this is why the module's app-level isolation test
  // uses tenantScoped instead). For this schema task we assert the backstop DDL is present:
  // every reporting table has FORCE ROW LEVEL SECURITY and the tenant_isolation policy.
  it('declares the RLS backstop (FORCE + tenant_isolation) on all seven reporting tables', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const tables = [
          'report',
          'metric_value',
          'flag',
          'flag_audit_entry',
          'norm_snapshot',
          'project_week_rollup',
          'comment',
        ];
        const res = await pool.query(
          `SELECT c.relname,
                  c.relrowsecurity  AS rls_enabled,
                  c.relforcerowsecurity AS rls_forced,
                  EXISTS (
                    SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'pm' AND p.tablename = c.relname
                      AND p.policyname = 'tenant_isolation'
                  ) AS has_policy
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'pm' AND c.relname = ANY($1)`,
          [tables],
        );
        expect(res.rowCount).toBe(tables.length);
        for (const row of res.rows) {
          expect(row.rls_enabled, `${row.relname} RLS enabled`).toBe(true);
          expect(row.rls_forced, `${row.relname} RLS forced`).toBe(true);
          expect(row.has_policy, `${row.relname} tenant_isolation policy`).toBe(true);
        }
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects UPDATE and DELETE on flag_audit_entry (append-only)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.report (id, tenant_id, project_id, iso_year, iso_week, reporter_id)
           VALUES ($1,$2,$3,2026,28,$4)`,
          [reportId, t.tenant_id, projectId, crypto.randomUUID()],
        );
        const flagId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.flag
             (id, tenant_id, project_id, iso_year, iso_week, report_id, category, computed_colour, final_colour)
           VALUES ($1,$2,$3,2026,28,$4,'quality','green','green')`,
          [flagId, t.tenant_id, projectId, reportId],
        );
        const entryId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.flag_audit_entry (id, tenant_id, flag_id, to_colour)
           VALUES ($1,$2,$3,'green')`,
          [entryId, t.tenant_id, flagId],
        );
        await expect(
          pool.query(`UPDATE pm.flag_audit_entry SET reason = 'x' WHERE id = $1`, [entryId]),
        ).rejects.toThrow(/append-only/);
        await expect(
          pool.query(`DELETE FROM pm.flag_audit_entry WHERE id = $1`, [entryId]),
        ).rejects.toThrow(/append-only/);
        // The row is untouched.
        const still = await pool.query(`SELECT 1 FROM pm.flag_audit_entry WHERE id = $1`, [
          entryId,
        ]);
        expect(still.rowCount).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('touch trigger bumps report.updated_at on UPDATE', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = await seedProject(pool, t.tenant_id);
        const reportId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.report (id, tenant_id, project_id, iso_year, iso_week, reporter_id, updated_at)
           VALUES ($1,$2,$3,2026,28,$4, now() - interval '1 hour')`,
          [reportId, t.tenant_id, projectId, crypto.randomUUID()],
        );
        const before = await pool.query(`SELECT updated_at FROM pm.report WHERE id = $1`, [
          reportId,
        ]);
        await pool.query(`UPDATE pm.report SET status = 'submitted' WHERE id = $1`, [reportId]);
        const after = await pool.query(`SELECT updated_at FROM pm.report WHERE id = $1`, [
          reportId,
        ]);
        expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
          new Date(before.rows[0].updated_at).getTime(),
        );
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
