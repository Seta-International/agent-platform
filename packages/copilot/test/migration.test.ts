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
