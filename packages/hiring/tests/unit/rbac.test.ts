import { describe, expect, it } from 'vitest';
import { HIRING_PERMISSIONS } from '../../src/rbac.ts';

describe('hiring rbac', () => {
  it('declares the requisition read + open permissions', () => {
    expect(HIRING_PERMISSIONS).toContain('hiring.requisition.read');
    expect(HIRING_PERMISSIONS).toContain('hiring.requisition.open');
  });
});

describe('hiring rbac (HIR-2)', () => {
  it('exposes the new requisition + jd_template verbs', () => {
    for (const p of [
      'hiring.requisition.manage',
      'hiring.requisition.close',
      'hiring.jd_template.read',
      'hiring.jd_template.manage',
    ]) {
      expect(HIRING_PERMISSIONS).toContain(p);
    }
  });
});
