import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('pm schema', () => {
  it('migrates the pm tables', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      initPools({ databaseUrl });
      try {
        const r = await pool.query(
          `SELECT table_name FROM information_schema.tables
             WHERE table_schema = 'pm' ORDER BY table_name`,
        );
        expect(r.rows.map((x) => x.table_name)).toEqual([
          'account',
          'account_recruiter',
          'allocation',
          'comment',
          'flag',
          'flag_audit_entry',
          'kpi_applied_metric',
          'kpi_norm',
          'kpi_norm_baseline',
          'kpi_norm_metric',
          'kpi_record',
          'kpi_record_entry',
          'metric_value',
          'norm_snapshot',
          'person_projection',
          'project',
          'project_access',
          'project_approval',
          'project_week_rollup',
          'projection_applied_event',
          'report',
          'report_revision',
          'reporter_assignment',
          'staffing_plan_line',
          'staffing_plan_line_skill',
        ]);
      } finally {
        await closePools();
      }
    });
  });
});
