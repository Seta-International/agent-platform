import { getLifecycleEntries, registerLifecycle, resetLifecycleRegistry } from '@seta/shared-db';
import { afterEach, describe, expect, it } from 'vitest';
import { retentionTick } from '../../src/runtime/workers/retention.ts';
import { withCoreTestDb } from '../helpers.ts';

afterEach(() => resetLifecycleRegistry());

describe('retentionTick', () => {
  it('runs every registered lifecycle policy against the worker pool', async () => {
    await withCoreTestDb(async ({ pool }) => {
      let ran = 0;
      registerLifecycle([
        {
          table: 'scratch.counter',
          policy: {
            kind: 'custom',
            run: async () => {
              ran += 1;
            },
          },
        },
      ]);
      await retentionTick(pool);
      expect(ran).toBe(1);
      expect(getLifecycleEntries()).toHaveLength(1);
    });
  });
});
