import { maintenance } from '@seta/shared-db';
import { describe, expect, it } from 'vitest';
import { cleanupExpiredRateLimitBuckets } from '../../src/backend/jobs/rate-limit-cleanup.ts';
import { withAgentTestDb } from '../helpers.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

describe('rate-limit cleanup job', () => {
  it('deletes expired buckets and keeps recent buckets', async () => {
    await withAgentTestDb(async ({ pool }) => {
      await pool.query(
        `INSERT INTO agent.rate_limits
           (tenant_id, user_id, window_start, tokens_in, tokens_out, turns)
         VALUES
           ($1, $2, now() - interval '120 seconds', 10, 0, 1),
           ($1, $2, now() - interval '30 seconds', 10, 0, 1)`,
        [TENANT, USER],
      );

      // Production reaches this through runRetention, which passes its own admin pool from
      // inside maintenance(). Expiring buckets spans every tenant, so exercise it at the
      // privilege it actually runs at rather than the scope withAgentTestDb happens to open.
      await maintenance(() => cleanupExpiredRateLimitBuckets());

      const rows = await pool.query<{ tokens_in: number }>(
        `SELECT tokens_in FROM agent.rate_limits WHERE tenant_id = $1 AND user_id = $2`,
        [TENANT, USER],
      );
      expect(rows.rows).toHaveLength(1);
    });
  });
});
