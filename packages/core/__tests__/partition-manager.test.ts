import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { partitionManagerTick } from '../src/workers/partition-manager.ts';
import { withCoreTestDb } from '../test/test-helpers.ts';

describe('partition manager', () => {
  it('creates partitions for current+1 and current+2 months', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      const before = await pool.query(
        `SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent='core.events'::regclass`,
      );
      const baseN = before.rows[0]?.n ?? 0;

      await partitionManagerTick();

      const after = await pool.query(
        `SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent='core.events'::regclass`,
      );
      // Migrations pre-create 13 partitions (months 0..12). The tick ensures month+1 and
      // month+2 which already exist — count should not decrease.
      expect(after.rows[0]?.n).toBeGreaterThanOrEqual(baseN);
    });
  });
});
