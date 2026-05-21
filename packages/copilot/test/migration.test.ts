import { describe, expect, it } from 'vitest';
import { withCopilotTestDb } from './test-helpers.ts';

describe('copilot migrations', () => {
  it('creates the rate_limits table in the copilot schema', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const rows = await pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'copilot' ORDER BY table_name`,
      );
      const names = rows.rows.map((r) => r.table_name);
      expect(names).toContain('rate_limits');
    });
  });
});

describe('workflow_runs migration', () => {
  it('creates the three tables and the partial index', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const tables = await pool.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'copilot'
          AND table_name IN ('workflow_runs', 'workflow_approvals', 'workflow_run_events_seen')
      `);
      expect(tables.rows.map((r) => r.table_name).sort()).toEqual([
        'workflow_approvals',
        'workflow_run_events_seen',
        'workflow_runs',
      ]);

      const partial = await pool.query<{ indexname: string; indexdef: string }>(`
        SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'copilot'
          AND indexname = 'workflow_approvals_pending_expires_idx'
      `);
      expect(partial.rows).toHaveLength(1);
      // toHaveLength(1) above guarantees rows[0] exists; TS cannot narrow through jest/vitest matchers
      expect(partial.rows[0]!.indexdef).toMatch(/WHERE \(status = 'pending'(::text)?\)/i);
    });
  });
});
