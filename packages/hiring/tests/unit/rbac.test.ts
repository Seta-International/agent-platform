import { describe, expect, it } from 'vitest';
import { HIRING_PERMISSIONS, hiringRbac } from '../../src/rbac.ts';

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

describe('hiring rbac (HIR-6/7 candidate + pipeline)', () => {
  it('grants candidate + rejection-reason verbs', () => {
    expect(HIRING_PERMISSIONS).toContain('hiring.candidate.create');
    expect(HIRING_PERMISSIONS).toContain('hiring.candidate.reject');
    expect(HIRING_PERMISSIONS).toContain('hiring.candidate.transfer');
    expect(HIRING_PERMISSIONS).toContain('hiring.rejection_reason.manage');
  });

  it('grants core.skill.read to recruiter + manager (catalog read), but not to viewer', () => {
    const grant = (slug: string) =>
      hiringRbac.roles.find((r) => r.slug === slug)?.permissions ?? [];
    expect(grant('hiring.recruiter')).toContain('core.skill.read');
    expect(grant('hiring.manager')).toContain('core.skill.read');
    expect(grant('hiring.viewer')).not.toContain('core.skill.read');
  });
});
