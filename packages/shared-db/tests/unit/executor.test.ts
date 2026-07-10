import type { Pool } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bindExecutorPools,
  currentExecutorMode,
  ExecutorContextError,
  executorPool,
  maintenance,
  scoped,
} from '../../src/executor.ts';

const appPool = { __name: 'app' } as unknown as Pool;
const adminPool = { __name: 'admin' } as unknown as Pool;

beforeEach(() => {
  bindExecutorPools(
    () => appPool,
    () => adminPool,
  );
});

describe('executorPool', () => {
  it('throws ExecutorContextError when no executor context is active', () => {
    expect(() => executorPool()).toThrow(ExecutorContextError);
  });

  it('names the offending call in the error so a missed wrapper is diagnosable', () => {
    expect(() => executorPool()).toThrow(/no executor context/i);
  });

  it('returns the app pool inside scoped()', async () => {
    await scoped('11111111-1111-1111-1111-111111111111', async () => {
      expect(executorPool()).toBe(appPool);
      expect(currentExecutorMode()).toBe('scoped');
    });
  });

  it('returns the admin pool inside maintenance()', async () => {
    await maintenance(async () => {
      expect(executorPool()).toBe(adminPool);
      expect(currentExecutorMode()).toBe('maintenance');
    });
  });

  it('restores the outer mode after a nested context exits', async () => {
    await maintenance(async () => {
      await scoped('11111111-1111-1111-1111-111111111111', async () => {
        expect(currentExecutorMode()).toBe('scoped');
      });
      expect(currentExecutorMode()).toBe('maintenance');
    });
  });

  it('does not leak context across an await boundary outside the callback', async () => {
    await maintenance(async () => {});
    expect(() => executorPool()).toThrow(ExecutorContextError);
  });
});
