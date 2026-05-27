import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitActualTokens, reserveTurn } from '../../src/backend/rate-limit.ts';
import { withAgentTestDb } from '../helpers.ts';

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';

describe('rate-limit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('allows under-limit reserves and rejects over-limit', async () => {
    await withAgentTestDb(async () => {
      const now = new Date('2026-05-27T00:00:00.000Z');
      for (let i = 0; i < 10; i++) {
        await reserveTurn({
          tenantId: TENANT,
          userId: USER,
          estimatedTokens: 500,
          turnLimit: 10,
          tpmLimit: 60_000,
          now,
        });
      }
      await expect(
        reserveTurn({
          tenantId: TENANT,
          userId: USER,
          estimatedTokens: 500,
          turnLimit: 10,
          tpmLimit: 60_000,
          now,
        }),
      ).rejects.toMatchObject({ code: 'rate_limited' });
    });
  });

  it('commitActualTokens applies atomic deltas for concurrent commits', async () => {
    await withAgentTestDb(async ({ pool }) => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const now = new Date('2026-05-27T00:00:00.000Z');
      const [first, second] = await Promise.all([
        reserveTurn({
          tenantId: TENANT,
          userId: USER,
          estimatedTokens: 1000,
          turnLimit: 10,
          tpmLimit: 60_000,
          now,
        }),
        reserveTurn({
          tenantId: TENANT,
          userId: USER,
          estimatedTokens: 1000,
          turnLimit: 10,
          tpmLimit: 60_000,
          now,
        }),
      ]);

      await Promise.all([
        commitActualTokens({
          tenantId: TENANT,
          userId: USER,
          reservationWindowStart: first.windowStart,
          estimatedTokensIn: first.estimatedTokensIn,
          actualTokensIn: 50,
          actualTokensOut: 20,
        }),
        commitActualTokens({
          tenantId: TENANT,
          userId: USER,
          reservationWindowStart: second.windowStart,
          estimatedTokensIn: second.estimatedTokensIn,
          actualTokensIn: 80,
          actualTokensOut: 30,
        }),
      ]);

      const row = await pool.query<{ tokens_in: number; tokens_out: number; turns: number }>(
        `SELECT tokens_in, tokens_out, turns
           FROM agent.rate_limits
          WHERE tenant_id = $1 AND user_id = $2 AND window_start = $3`,
        [TENANT, USER, now],
      );
      expect(row.rows[0]).toMatchObject({ tokens_in: 130, tokens_out: 50, turns: 2 });
    });
  });

  it('commitActualTokens uses the reservation bucket across clock boundaries', async () => {
    await withAgentTestDb(async ({ pool }) => {
      vi.spyOn(console, 'info').mockImplementation(() => {});
      const reservation = await reserveTurn({
        tenantId: TENANT,
        userId: USER,
        estimatedTokens: 1000,
        turnLimit: 10,
        tpmLimit: 60_000,
        now: new Date('2026-05-27T12:34:59.900Z'),
      });

      await commitActualTokens({
        tenantId: TENANT,
        userId: USER,
        reservationWindowStart: reservation.windowStart,
        estimatedTokensIn: reservation.estimatedTokensIn,
        actualTokensIn: 50,
        actualTokensOut: 100,
      });

      const row = await pool.query<{ window_start: Date; tokens_in: number; tokens_out: number }>(
        `SELECT window_start, tokens_in, tokens_out
           FROM agent.rate_limits
          WHERE tenant_id = $1 AND user_id = $2`,
        [TENANT, USER],
      );
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0]).toMatchObject({
        window_start: new Date('2026-05-27T12:34:59.000Z'),
        tokens_in: 50,
        tokens_out: 100,
      });
    });
  });

  it('commitActualTokens warns and does not create a row when the reservation row is missing', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await commitActualTokens({
        tenantId: TENANT,
        userId: USER,
        reservationWindowStart: new Date('2026-05-27T00:00:00.000Z'),
        estimatedTokensIn: 1000,
        actualTokensIn: 50,
        actualTokensOut: 20,
      });

      const count = await pool.query<{ count: string }>(
        `SELECT count(*) FROM agent.rate_limits WHERE tenant_id = $1 AND user_id = $2`,
        [TENANT, USER],
      );
      expect(count.rows[0]?.count).toBe('0');
      expect(warn).toHaveBeenCalledWith(
        '[agent.rate-limit.commit.missing-row]',
        expect.objectContaining({ tenantId: TENANT, userId: USER }),
      );
    });
  });

  it('slides the 60-second window instead of waiting for a fixed minute boundary', async () => {
    await withAgentTestDb(async ({ pool }) => {
      await pool.query(
        `INSERT INTO agent.rate_limits
           (tenant_id, user_id, window_start, tokens_in, tokens_out, turns)
         VALUES ($1, $2, $3, 100, 0, 1)`,
        [TENANT, USER, new Date('2026-05-27T12:00:02.000Z')],
      );

      await expect(
        reserveTurn({
          tenantId: TENANT,
          userId: USER,
          estimatedTokens: 1,
          turnLimit: 10,
          tpmLimit: 100,
          now: new Date('2026-05-27T12:01:01.000Z'),
        }),
      ).rejects.toMatchObject({ code: 'rate_limited', retryAfterSeconds: 1 });

      await expect(
        reserveTurn({
          tenantId: TENANT,
          userId: USER,
          estimatedTokens: 1,
          turnLimit: 10,
          tpmLimit: 100,
          now: new Date('2026-05-27T12:01:03.000Z'),
        }),
      ).resolves.toMatchObject({
        windowStart: new Date('2026-05-27T12:01:03.000Z'),
        estimatedTokensIn: 1,
      });
    });
  });
});
