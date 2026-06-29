// packages/core/tests/unit/flag-catalog.test.ts
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContributionRegistry } from '../../src/composition/registry.ts';
import { getFlagCatalog, isKnownFlagKey, setFlagCatalog } from '../../src/flags/catalog.ts';

const stubModule = (name: string, flags: { key: string; description: string }[]) => ({
  name,
  schema: {},
  migrationsDir: resolve('.'),
  flags,
});

describe('flag catalog', () => {
  it('singleton round-trips and reports known keys', () => {
    setFlagCatalog([{ key: 'hiring', description: 'Hiring module' }]);
    expect(getFlagCatalog().map((d) => d.key)).toEqual(['hiring']);
    expect(isKnownFlagKey('hiring')).toBe(true);
    expect(isKnownFlagKey('nope')).toBe(false);
  });

  it('registry collects module flags and rejects duplicate keys', () => {
    const reg = createContributionRegistry();
    reg.module(stubModule('hiring', [{ key: 'hiring', description: 'Hiring' }]));
    reg.module(stubModule('people', [{ key: 'people.resource-allocation', description: 'Alloc' }]));
    expect(reg.collected.flagCatalog.map((d) => d.key).sort()).toEqual([
      'hiring',
      'people.resource-allocation',
    ]);

    const dup = createContributionRegistry();
    dup.module(stubModule('a', [{ key: 'dupe', description: 'a' }]));
    expect(() => dup.module(stubModule('b', [{ key: 'dupe', description: 'b' }]))).toThrow(
      /duplicate flag key/,
    );
  });
});
