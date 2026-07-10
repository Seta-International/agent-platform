import { currentExecutorMode, scoped } from '@seta/shared-db';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { emit, withEmit } from '../../src/events/index.ts';
import { waitFor, withCoreTestDb, withDispatcher } from '../helpers.ts';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

describe('dispatcher executor context', () => {
  it('runs each subscriber handler inside a scoped executor context', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      const seen: (string | undefined)[] = [];
      const sub = {
        subscription: 'test.executor-probe',
        event: 'test.probe.fired',
        eventVersion: 1,
        handler: async () => {
          seen.push(currentExecutorMode());
        },
      };

      await withDispatcher({ subscribers: [sub], pool }, async () => {
        await scoped(TENANT_ID, () =>
          withEmit(undefined, async () => {
            await emit({
              tenantId: TENANT_ID,
              aggregateType: 'test.thing',
              aggregateId: '00000000-0000-0000-0000-000000000002',
              eventType: 'test.probe.fired',
              eventVersion: 1,
              payload: {},
            });
          }),
        );

        await waitFor(async () => seen.length === 1);
      });

      expect(seen).toEqual(['scoped']);
    });
  });
});
