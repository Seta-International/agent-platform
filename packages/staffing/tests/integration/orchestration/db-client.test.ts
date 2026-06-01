import { describe, expect, it } from 'vitest';
import { orchestrationRuns, staffingDb } from '../../../src/backend/db/index.ts';
import { withAgentTestDb } from '../../helpers.ts';

describe('staffingDb()', () => {
  it('connects and can query the orchestration_runs table', async () => {
    await withAgentTestDb(async () => {
      const rows = await staffingDb().select().from(orchestrationRuns).limit(1);
      expect(Array.isArray(rows)).toBe(true);
    });
  });
});
