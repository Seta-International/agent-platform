// packages/core/tests/integration/flag-provider.test.ts
import { describe, expect, it } from 'vitest';
import { SetaFeatureProvider } from '../../src/flags/provider.ts';
import type { FlagRow } from '../../src/flags/types.ts';

const ctx = { targetingKey: 'u1', tenantId: 't1', userId: 'u1', roles: [] as string[] };

describe('SetaFeatureProvider', () => {
  it('OR-composes the effective row strategies', async () => {
    const p = new SetaFeatureProvider({
      getEffectiveFlag: async (_t, key): Promise<FlagRow | undefined> =>
        key === 'hiring' ? { key, tenant_id: 't1', strategies: [{ kind: 'enabled' }] } : undefined,
    });
    expect((await p.resolveBooleanEvaluation('hiring', false, ctx)).value).toBe(true);
  });

  it('returns the default when no row exists', async () => {
    const p = new SetaFeatureProvider({ getEffectiveFlag: async () => undefined });
    expect((await p.resolveBooleanEvaluation('missing', false, ctx)).value).toBe(false);
  });

  it('never throws — returns default on loader error', async () => {
    const p = new SetaFeatureProvider({
      getEffectiveFlag: async () => {
        throw new Error('db down');
      },
    });
    expect((await p.resolveBooleanEvaluation('hiring', false, ctx)).value).toBe(false);
  });

  it('returns the default when context is missing identity fields', async () => {
    const p = new SetaFeatureProvider({
      getEffectiveFlag: async () => ({
        key: 'hiring',
        tenant_id: 't1',
        strategies: [{ kind: 'enabled' }],
      }),
    });
    expect((await p.resolveBooleanEvaluation('hiring', false, {})).value).toBe(false);
  });
});
