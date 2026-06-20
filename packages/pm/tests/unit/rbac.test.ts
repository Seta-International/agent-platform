import { describe, expect, it } from 'vitest';
import { PM_PERMISSIONS } from '../../src/rbac.ts';

describe('pm rbac', () => {
  it('declares the account read + manage permissions', () => {
    expect(PM_PERMISSIONS).toContain('pm.account.read');
    expect(PM_PERMISSIONS).toContain('pm.account.manage');
  });
});
