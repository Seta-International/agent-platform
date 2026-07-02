import { describe, expect, it } from 'vitest';
import { personaGroupsFor } from '../../src/commands/seed-fixture/rbac-map.ts';

describe('personaGroupsFor', () => {
  it('ADMIN → admin persona group (org.admin wildcard subsumes the old pm.pmo grant)', () => {
    expect(personaGroupsFor('ADMIN')).toEqual(['admin']);
  });

  it('PRODUCT DIRECTOR → bod persona group (final approval gate)', () => {
    expect(personaGroupsFor('Product Director')).toEqual(['bod']);
  });

  it('PM → am persona group (pm.manager)', () => {
    expect(personaGroupsFor('PM')).toEqual(['am']);
  });

  it('DEV → no extra persona group (base member only)', () => {
    expect(personaGroupsFor('DEV')).toEqual([]);
  });

  it('case-insensitive: admin (lowercase) maps same as ADMIN', () => {
    expect(personaGroupsFor('admin')).toEqual(['admin']);
  });

  it('MARKETING → no extra persona group (base member only)', () => {
    expect(personaGroupsFor('MARKETING')).toEqual([]);
  });

  it('DIRECTOR → am persona group (pm.manager)', () => {
    expect(personaGroupsFor('DIRECTOR')).toEqual(['am']);
  });

  it('unknown role falls back to base member only', () => {
    expect(personaGroupsFor('RANDOM_ROLE')).toEqual([]);
  });
});
