// packages/core/tests/unit/flag-strategies.test.ts
import { describe, expect, it } from 'vitest';
import { evaluateStrategies, getStrategy, knownStrategyKinds } from '../../src/flags/strategies.ts';
import type { FlagContext } from '../../src/flags/types.ts';

const ctx = (userId: string): FlagContext => ({ tenantId: 't1', userId, roles: [] });

describe('flag strategy engine', () => {
  it('registers the two built-in kinds', () => {
    expect(knownStrategyKinds().sort()).toEqual(['enabled', 'member-allowlist']);
    expect(getStrategy('enabled')).toBeDefined();
  });

  it('enabled returns true for anyone', () => {
    expect(evaluateStrategies([{ kind: 'enabled' }], ctx('u1'))).toBe(true);
  });

  it('member-allowlist returns membership', () => {
    const s = [{ kind: 'member-allowlist', config: { userIds: ['u1', 'u2'] } }];
    expect(evaluateStrategies(s, ctx('u1'))).toBe(true);
    expect(evaluateStrategies(s, ctx('u9'))).toBe(false);
  });

  it('OR-composes: any true wins', () => {
    const s = [{ kind: 'member-allowlist', config: { userIds: ['u2'] } }, { kind: 'enabled' }];
    expect(evaluateStrategies(s, ctx('u1'))).toBe(true);
  });

  it('empty strategies is off', () => {
    expect(evaluateStrategies([], ctx('u1'))).toBe(false);
  });

  it('unknown kind is fail-closed (skipped) and logged', () => {
    const warned: unknown[] = [];
    expect(
      evaluateStrategies([{ kind: 'percentage', config: {} }], ctx('u1'), {
        warn: (o) => warned.push(o),
      }),
    ).toBe(false);
    expect(warned).toHaveLength(1);
  });
});
