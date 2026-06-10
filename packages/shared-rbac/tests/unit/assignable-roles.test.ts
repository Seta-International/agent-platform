import { describe, expect, it } from 'vitest';
import { ASSIGNABLE_ROLES } from '../../src/inventory.ts';

describe('ASSIGNABLE_ROLES', () => {
  it('includes foundation-grantable + all module roles', () => {
    for (const r of [
      'org.admin',
      'org.viewer',
      'identity.admin',
      'knowledge.member',
      'planner.contributor',
      'planner.viewer',
      'staffing.operator',
      'notifications.member',
    ])
      expect(ASSIGNABLE_ROLES).toContain(r);
  });
  it('excludes the wildcard tenant.admin and system actor roles', () => {
    expect(ASSIGNABLE_ROLES).not.toContain('tenant.admin');
    expect(ASSIGNABLE_ROLES).not.toContain('system.integrations.m365');
  });
});
