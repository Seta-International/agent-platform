import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { emit, withEmit } from '../../src/events/index.ts';
import { startDispatcher } from '../../src/runtime/dispatcher/index.ts';
import { waitFor, withCoreTestDb } from '../helpers.ts';

describe('dispatcher health surfaces real DLQ count', () => {
  it('counts rows in core.subscription_dead_letter within the 24h window', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      const failingSub = {
        subscription: 'test.dlq.surfaced',
        event: 'test.dlq.surfaced.entity.created',
        eventVersion: 1,
        handler: async () => {
          throw new Error('always fails');
        },
      };
      const d = await startDispatcher({
        pool,
        subscribers: [failingSub],
        backoff: { baseMs: 10, maxMs: 50, maxAttempts: 2 },
        pollIntervalMs: 25,
      });
      try {
        await withEmit(undefined, async () => {
          await emit({
            tenantId: '00000000-0000-0000-0000-000000000001',
            aggregateType: 'test.dlq.surfaced',
            aggregateId: '00000000-0000-0000-0000-000000000001',
            eventType: 'test.dlq.surfaced.entity.created',
            eventVersion: 1,
            payload: {},
          });
        });

        await waitFor(async () => {
          const { rows } = await pool.query(
            `SELECT count(*)::int AS n FROM core.subscription_dead_letter WHERE subscription=$1`,
            [failingSub.subscription],
          );
          return (rows[0]?.n as number | undefined) === 1;
        });

        const h = await d.health();
        const sub = h.subscriptions.find((s) => s.subscription === failingSub.subscription);
        expect(sub).toBeDefined();
        expect(sub?.deadLetterCount24h).toBeGreaterThanOrEqual(1);
      } finally {
        await d.shutdown(2_000);
      }
    });
  });
});
