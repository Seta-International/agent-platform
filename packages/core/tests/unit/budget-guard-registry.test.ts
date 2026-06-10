import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetBudgetGuardForTests,
  BudgetExceededError,
  checkBudget,
  registerBudgetGuard,
} from '../../src/billing/budget-guard.ts';

afterEach(() => __resetBudgetGuardForTests());

describe('budget guard registry', () => {
  it('defaults to allow when no guard is registered', async () => {
    expect(await checkBudget('t1')).toEqual({ blocked: false });
  });

  it('delegates to the registered guard', async () => {
    registerBudgetGuard({ check: async () => ({ blocked: true, reason: 'day' }) });
    expect(await checkBudget('t1')).toEqual({ blocked: true, reason: 'day' });
  });

  it('never throws if the guard throws — fails open', async () => {
    registerBudgetGuard({
      check: async () => {
        throw new Error('db down');
      },
    });
    expect(await checkBudget('t1')).toEqual({ blocked: false });
  });

  it('BudgetExceededError carries the period', () => {
    const e = new BudgetExceededError('month');
    expect(e.period).toBe('month');
    expect(e.message).toContain('month');
  });
});
