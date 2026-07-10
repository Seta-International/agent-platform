import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { emit, withEmit } from '../../src/events/index.ts';
import { startDispatcher } from '../../src/runtime/dispatcher/index.ts';
import { waitFor, withCoreTestDb } from '../helpers.ts';

describe('dispatcher per-subscriber isolation', () => {
  it('slow subscriber does not block fast one within one wall-clock window', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      let slowSeen = 0;
      let fastSeen = 0;

      // The slow subscriber blocks on a gate the test opens rather than on a 300ms timer.
      // A timer makes both assertions below a race against the runner: fast has to drain
      // ten events before slow's sleep elapses. Held open, slow cannot advance past its
      // first handler at all, so "fast drained everything while slow sat still" becomes a
      // statement about the dispatcher instead of about wall-clock speed.
      let openGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
      const slowSub = {
        subscription: 'test.iso.slow',
        event: 'test.iso.entity.created',
        eventVersion: 1,
        handler: async () => {
          slowSeen += 1;
          await gate;
        },
      };
      const fastSub = {
        subscription: 'test.iso.fast',
        event: 'test.iso.entity.created',
        eventVersion: 1,
        handler: async () => {
          fastSeen += 1;
        },
      };

      const EVENTS = 10;
      const d = await startDispatcher({
        pool,
        subscribers: [slowSub, fastSub],
        pollIntervalMs: 25,
      });
      try {
        await withEmit(undefined, async () => {
          for (let i = 0; i < EVENTS; i++) {
            await emit({
              tenantId: '00000000-0000-0000-0000-000000000001',
              aggregateType: 'test.iso',
              aggregateId: '00000000-0000-0000-0000-000000000001',
              eventType: 'test.iso.entity.created',
              eventVersion: 1,
              payload: { i },
            });
          }
        });

        // Fast must drain every event while slow is stuck in its first handler. If the
        // dispatcher serialized subscribers (old Promise.all single-flight tick), fast
        // would be gated behind slow and this would never settle.
        await waitFor(() => fastSeen === EVENTS);
        expect(fastSeen).toBe(EVENTS);
        expect(slowSeen).toBe(1);
      } finally {
        openGate();
        await d.shutdown(10_000);
      }
    });
  });
});
