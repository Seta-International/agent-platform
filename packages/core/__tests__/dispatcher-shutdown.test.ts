import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { startDispatcher } from '../src/dispatcher/index.ts';
import { emit, withEmit } from '../src/events/index.ts';
import { withCoreTestDb } from '../test/test-helpers.ts';

describe('dispatcher graceful shutdown', () => {
  it('shutdown waits for in-flight handler to complete', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      let started = false;
      let completed = false;
      const sub = {
        subscription: 'test.slow',
        event: 'test.slow.thing',
        eventVersion: 1,
        handler: async () => {
          started = true;
          await new Promise((r) => setTimeout(r, 800));
          completed = true;
        },
      };

      const handle = await startDispatcher({ pool, subscribers: [sub], pollIntervalMs: 50 });

      await withEmit(undefined, async () => {
        await emit({
          tenantId: '00000000-0000-0000-0000-000000000001',
          aggregateType: 'test.slow',
          aggregateId: '00000000-0000-0000-0000-000000000002',
          eventType: 'test.slow.thing',
          eventVersion: 1,
          payload: {},
        });
      });

      await new Promise((r) => setTimeout(r, 300));
      expect(started).toBe(true);
      expect(completed).toBe(false);

      await handle.shutdown(5_000);
      expect(completed).toBe(true);
    });
  });
});
