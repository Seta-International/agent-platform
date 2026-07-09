import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { emit, withEmit } from '../../src/events/index.ts';
import { startDispatcher } from '../../src/runtime/dispatcher/index.ts';
import { withCoreTestDb } from '../helpers.ts';

describe('dispatcher graceful shutdown', () => {
  it('shutdown waits for in-flight handler to complete', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      let started = false;
      let completed = false;
      // The handler blocks on a gate the test opens, not on a timer: a sleeping handler
      // makes "shutdown waited" a race against the runner's speed, and on CI it lost —
      // shutdown's grace expired, it returned with the handler's connection still checked
      // out, and the pool's end() then never resolved.
      let openGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
      const sub = {
        subscription: 'test.slow',
        event: 'test.slow.thing',
        eventVersion: 1,
        handler: async () => {
          started = true;
          await gate;
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

      const deadline = Date.now() + 10_000;
      while (!started && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(started).toBe(true);
      expect(completed).toBe(false);

      // shutdown must not resolve while the handler is still inside the gate.
      const shuttingDown = handle.shutdown(30_000);
      const raced = await Promise.race([
        shuttingDown.then(() => 'resolved'),
        new Promise((r) => setTimeout(() => r('waiting'), 200)),
      ]);
      expect(raced).toBe('waiting');
      expect(completed).toBe(false);

      openGate();
      await shuttingDown;
      expect(completed).toBe(true);
    });
  });
});
