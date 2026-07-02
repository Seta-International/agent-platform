import { describe, expect, it } from 'vitest';
import { A2_PERMISSIONS } from '../../src/rbac.ts';

describe('A2_PERMISSIONS', () => {
  it('includes identity.profile.update', () => {
    expect(A2_PERMISSIONS).toContain('identity.profile.update');
  });
});
