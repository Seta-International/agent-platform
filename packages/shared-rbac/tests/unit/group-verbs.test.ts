import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '../../src/generated/permission-keys.ts';

describe('group rbac verbs', () => {
  it('registers the group management permissions', () => {
    for (const k of [
      'identity.group.read',
      'identity.group.create',
      'identity.group.update',
      'identity.group.delete',
      'identity.group.membership.manage',
      'identity.group.role.manage',
    ])
      expect(ALL_PERMISSIONS).toContain(k);
  });
});
