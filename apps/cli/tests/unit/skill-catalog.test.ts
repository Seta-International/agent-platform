import { describe, expect, it } from 'vitest';
import { SKILL_CATALOG, skillNamesForRole } from '../../src/commands/seed-fixture/skill-catalog.ts';

describe('SKILL_CATALOG', () => {
  it('has unique skill names across categories', () => {
    const all = SKILL_CATALOG.flatMap((c) => c.skills);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('skillNamesForRole', () => {
  it('maps DEV to engineering skills present in the catalog', () => {
    const all = new Set(SKILL_CATALOG.flatMap((c) => c.skills));
    const devSkills = skillNamesForRole('DEV');
    expect(devSkills).toContain('TypeScript');
    for (const s of devSkills) expect(all.has(s)).toBe(true);
  });

  it('is case-insensitive on the role', () => {
    expect(skillNamesForRole('qa')).toEqual(skillNamesForRole('QA'));
  });

  it('falls back to a default for unknown roles', () => {
    expect(skillNamesForRole('WIZARD')).toEqual(['Communication']);
  });
});
