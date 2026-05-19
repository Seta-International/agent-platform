import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { emit, withEmit } from '../src/events/index.ts';
import { waitFor, withCoreTestDb, withDispatcher } from '../test/test-helpers.ts';

describe('dispatcher burst', () => {
  it('delivers a burst of 200 events to one subscriber, cursor + processed table consistent', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      let handled = 0;
      const sub = {
        subscription: 'test.counter',
        event: 'test.thing.happened',
        eventVersion: 1,
        handler: async () => {
          handled++;
        },
      };

      await withDispatcher({ subscribers: [sub], pool }, async () => {
        await withEmit(undefined, async () => {
          for (let i = 0; i < 200; i++) {
            await emit({
              tenantId: '00000000-0000-0000-0000-000000000001',
              aggregateType: 'test.thing',
              aggregateId: '00000000-0000-0000-0000-000000000002',
              eventType: 'test.thing.happened',
              eventVersion: 1,
              payload: { i },
            });
          }
        });

        await waitFor(async () => {
          const { rows } = await pool.query(
            `SELECT count(*)::int AS n FROM core.subscription_processed WHERE subscription='test.counter'`,
          );
          return rows[0]?.n === 200;
        });
      });

      expect(handled).toBe(200);
    });
  });
});
