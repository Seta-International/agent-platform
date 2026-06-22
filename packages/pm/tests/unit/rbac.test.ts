import { describe, expect, it } from 'vitest';
import { PM_PERMISSIONS } from '../../src/rbac.ts';

describe('pm rbac', () => {
  it('declares the account read + manage permissions', () => {
    expect(PM_PERMISSIONS).toContain('pm.account.read');
    expect(PM_PERMISSIONS).toContain('pm.account.manage');
  });

  it('exposes charter + project permissions', () => {
    for (const p of [
      'pm.charter.submit',
      'pm.charter.pmo_signoff',
      'pm.charter.bod_approve',
      'pm.charter.read',
      'pm.project.read',
      'pm.project.manage',
    ]) {
      expect(PM_PERMISSIONS).toContain(p);
    }
  });
});
