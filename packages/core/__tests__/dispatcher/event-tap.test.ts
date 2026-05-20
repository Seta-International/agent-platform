import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { _clearTapsForTest, addEventTap } from '../../src/dispatcher/event-tap.ts';
import { emit, withEmit } from '../../src/events/index.ts';
import { waitFor, withCoreTestDb, withDispatcher } from '../../test/test-helpers.ts';

describe('addEventTap', () => {
  it('fires tap handler for events emitted after dispatcher starts', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      _clearTapsForTest();

      const received: string[] = [];
      const unsub = addEventTap(
        (e) => e.eventType === 'test.tap.happened',
        (e) => received.push((e.payload as { label: string }).label),
      );

      try {
        await withDispatcher({ subscribers: [], pool }, async () => {
          await withEmit(undefined, async () => {
            await emit({
              tenantId: '00000000-0000-0000-0000-000000000001',
              aggregateType: 'test.tap',
              aggregateId: '00000000-0000-0000-0000-000000000002',
              eventType: 'test.tap.happened',
              eventVersion: 1,
              payload: { label: 'hello-tap' },
            });
          });

          await waitFor(() => received.length > 0, 10_000);
        });
      } finally {
        unsub();
        _clearTapsForTest();
      }

      expect(received).toEqual(['hello-tap']);
    });
  });

  it('tap predicate filters out non-matching events', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      _clearTapsForTest();

      const received: string[] = [];
      const unsub = addEventTap(
        (e) => e.eventType === 'test.tap.wanted',
        (e) => received.push((e.payload as { label: string }).label),
      );

      try {
        await withDispatcher({ subscribers: [], pool }, async () => {
          await withEmit(undefined, async () => {
            await emit({
              tenantId: '00000000-0000-0000-0000-000000000001',
              aggregateType: 'test.tap',
              aggregateId: '00000000-0000-0000-0000-000000000003',
              eventType: 'test.tap.ignored',
              eventVersion: 1,
              payload: { label: 'should-be-dropped' },
            });
            await emit({
              tenantId: '00000000-0000-0000-0000-000000000001',
              aggregateType: 'test.tap',
              aggregateId: '00000000-0000-0000-0000-000000000004',
              eventType: 'test.tap.wanted',
              eventVersion: 1,
              payload: { label: 'kept' },
            });
          });

          await waitFor(() => received.length > 0, 10_000);
          // Allow a brief window for any extra events to arrive.
          await new Promise((r) => setTimeout(r, 200));
        });
      } finally {
        unsub();
        _clearTapsForTest();
      }

      expect(received).toEqual(['kept']);
    });
  });

  it('unsubscribe stops tap from receiving further events', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      _clearTapsForTest();

      const received: string[] = [];
      const unsub = addEventTap(
        (e) => e.eventType === 'test.tap.unsub',
        (e) => received.push((e.payload as { label: string }).label),
      );

      // Remove tap before any events are emitted.
      unsub();

      try {
        await withDispatcher({ subscribers: [], pool }, async () => {
          await withEmit(undefined, async () => {
            await emit({
              tenantId: '00000000-0000-0000-0000-000000000001',
              aggregateType: 'test.tap',
              aggregateId: '00000000-0000-0000-0000-000000000005',
              eventType: 'test.tap.unsub',
              eventVersion: 1,
              payload: { label: 'after-unsub' },
            });
          });

          // Give the dispatcher enough time to pick up the event if the tap were still
          // registered. The received array should remain empty.
          await new Promise((r) => setTimeout(r, 500));
        });
      } finally {
        _clearTapsForTest();
      }

      expect(received).toHaveLength(0);
    });
  });

  it('a throwing tap handler does not prevent other taps from firing', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      _clearTapsForTest();

      const received: string[] = [];
      const unsubBad = addEventTap(
        (e) => e.eventType === 'test.tap.multi',
        () => {
          throw new Error('tap-explodes');
        },
      );
      const unsubGood = addEventTap(
        (e) => e.eventType === 'test.tap.multi',
        (e) => received.push((e.payload as { label: string }).label),
      );

      try {
        await withDispatcher({ subscribers: [], pool }, async () => {
          await withEmit(undefined, async () => {
            await emit({
              tenantId: '00000000-0000-0000-0000-000000000001',
              aggregateType: 'test.tap',
              aggregateId: '00000000-0000-0000-0000-000000000006',
              eventType: 'test.tap.multi',
              eventVersion: 1,
              payload: { label: 'survives-bad-tap' },
            });
          });

          await waitFor(() => received.length > 0, 10_000);
        });
      } finally {
        unsubBad();
        unsubGood();
        _clearTapsForTest();
      }

      expect(received).toEqual(['survives-bad-tap']);
    });
  });
});
