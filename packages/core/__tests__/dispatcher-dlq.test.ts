import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { startDispatcher } from '../src/dispatcher/index.ts';
import { emit, withEmit } from '../src/events/index.ts';
import { waitFor, withCoreTestDb } from '../test/test-helpers.ts';

describe('dispatcher DLQ', () => {
  it('after 3 failures (override), event lands in dead_letter and cursor advances', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      let attempts = 0;
      const failingSub = {
        subscription: 'test.always-fails',
        event: 'test.bad.thing',
        eventVersion: 1,
        handler: async () => {
          attempts++;
          throw new Error('boom');
        },
      };
      let siblingHandled = 0;
      const siblingSub = {
        subscription: 'test.sibling',
        event: 'test.good.thing',
        eventVersion: 1,
        handler: async () => {
          siblingHandled++;
        },
      };

      const handle = await startDispatcher({
        pool,
        subscribers: [failingSub, siblingSub],
        pollIntervalMs: 50,
        backoff: { baseMs: 10, maxMs: 50, maxAttempts: 3 },
      });
      try {
        await withEmit(undefined, async () => {
          await emit({
            tenantId: '00000000-0000-0000-0000-000000000001',
            aggregateType: 'test.bad',
            aggregateId: '00000000-0000-0000-0000-000000000002',
            eventType: 'test.bad.thing',
            eventVersion: 1,
            payload: {},
          });
          await emit({
            tenantId: '00000000-0000-0000-0000-000000000001',
            aggregateType: 'test.good',
            aggregateId: '00000000-0000-0000-0000-000000000003',
            eventType: 'test.good.thing',
            eventVersion: 1,
            payload: {},
          });
        });

        await waitFor(async () => {
          const { rows } = await pool.query(
            `SELECT count(*)::int AS n FROM core.subscription_dead_letter WHERE subscription='test.always-fails'`,
          );
          return rows[0]?.n === 1;
        });

        expect(siblingHandled).toBe(1);
        expect(attempts).toBeGreaterThanOrEqual(3);
      } finally {
        await handle.shutdown(5_000);
      }
    });
  });
});
