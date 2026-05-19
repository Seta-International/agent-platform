import { describe, expect, it } from 'vitest';
import { createContributionRegistry } from '../src/index.ts';
import { registerCoreContributions } from '../src/register.ts';

describe('ContributionRegistry', () => {
  it('registerCoreContributions populates schema + migrationsDir', () => {
    const reg = createContributionRegistry();
    registerCoreContributions(reg);

    expect(reg.collected.schemas.has('core')).toBe(true);
    expect(reg.collected.migrationDirs).toHaveLength(1);
    expect(reg.collected.migrationDirs[0]?.module).toBe('core');
    expect(reg.collected.migrationDirs[0]?.dir).toMatch(/packages\/core\/drizzle\/migrations$/);
    expect(reg.collected.subscribers).toHaveLength(3);
  });

  it('publicApi entries are accumulated per module', () => {
    const reg = createContributionRegistry();
    reg.publicApi('core', { hello: () => 1 });
    expect(reg.collected.publicApis.get('core')).toBeDefined();
  });
});
