import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { startDispatcher } from '../src/dispatcher/index.ts';
import { emit, withEmit } from '../src/events/index.ts';
import { waitFor, withCoreTestDb } from '../test/test-helpers.ts';

describe('dispatcher multi-replica', () => {
  it('two dispatchers against the same DB process each event exactly once', async () => {
    await withCoreTestDb(async ({ databaseUrl, pool }) => {
      resetCoreDb();

      const handled: number[] = [];
      const sub = {
        subscription: 'test.exactly-once',
        event: 'test.multi.thing',
        eventVersion: 1,
        handler: async (e: { payload: unknown }) => {
          handled.push((e.payload as { i: number }).i);
        },
      };

      const poolB = new Pool({ connectionString: databaseUrl });
      const a = await startDispatcher({ pool, subscribers: [sub], pollIntervalMs: 50 });
      const b = await startDispatcher({ pool: poolB, subscribers: [sub], pollIntervalMs: 50 });

      try {
        await withEmit(undefined, async () => {
          for (let i = 0; i < 100; i++) {
            await emit({
              tenantId: '00000000-0000-0000-0000-000000000001',
              aggregateType: 'test.multi',
              aggregateId: '00000000-0000-0000-0000-000000000002',
              eventType: 'test.multi.thing',
              eventVersion: 1,
              payload: { i },
            });
          }
        });

        await waitFor(async () => {
          const { rows } = await pool.query(
            `SELECT count(*)::int AS n FROM core.subscription_processed WHERE subscription='test.exactly-once'`,
          );
          return rows[0]?.n === 100;
        }, 30_000);
      } finally {
        await a.shutdown(5_000);
        await b.shutdown(5_000);
        await poolB.end();
      }

      const seen = new Set(handled);
      expect(seen.size).toBe(100);
      expect(handled.length).toBe(100);
    });
  });
});
