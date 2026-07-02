import { ASSIGNABLE_ROLES } from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { PERSONA_GROUPS } from '../../src/commands/lib/access-groups.ts';

function roleIn(slug: string, roleSlug: string) {
  const group = PERSONA_GROUPS.find((g) => g.slug === slug);
  return group?.roles.find((r) => r.slug === roleSlug);
}

describe('PERSONA_GROUPS scoping', () => {
  it('member.people.viewer is self-scoped', () => {
    expect(roleIn('member', 'people.viewer')?.scope_kind).toBe('self');
  });

  it("member's other roles stay tenant (no scope_kind override)", () => {
    for (const slug of ['planner.member', 'knowledge.member']) {
      expect(roleIn('member', slug)?.scope_kind).toBeUndefined();
    }
  });

  it('member.agent.member is self-scoped (post-suffix-retirement, scope comes from assignment scope_kind)', () => {
    expect(roleIn('member', 'agent.member')?.scope_kind).toBe('self');
  });

  it('team-lead-pm.people.viewer is self-scoped', () => {
    expect(roleIn('team-lead-pm', 'people.viewer')?.scope_kind).toBe('self');
  });

  it('team-lead-pm.hiring.recruiter is self-scoped', () => {
    expect(roleIn('team-lead-pm', 'hiring.recruiter')?.scope_kind).toBe('self');
  });

  it("team-lead-pm's other roles stay tenant (no scope_kind override)", () => {
    for (const slug of ['pm.manager', 'planner.member']) {
      expect(roleIn('team-lead-pm', slug)?.scope_kind).toBeUndefined();
    }
  });

  it('hr.hiring.recruiter is self-scoped', () => {
    expect(roleIn('hr', 'hiring.recruiter')?.scope_kind).toBe('self');
  });

  it("hr's other roles stay tenant (no scope_kind override)", () => {
    for (const slug of ['people.manager', 'hiring.manager']) {
      expect(roleIn('hr', slug)?.scope_kind).toBeUndefined();
    }
  });

  it('am.pm.manager is self-scoped (reach comes from account/lead relationship arms, not tenant-wide)', () => {
    expect(roleIn('am', 'pm.manager')?.scope_kind).toBe('self');
  });

  it('pmo, admin roles are unscoped (tenant)', () => {
    for (const slug of ['pmo', 'admin']) {
      const group = PERSONA_GROUPS.find((g) => g.slug === slug);
      expect(group).toBeDefined();
      for (const r of group?.roles ?? []) expect(r.scope_kind).toBeUndefined();
    }
  });

  it('bod.people.viewer stays tenant (board sees everything, an intended widening)', () => {
    expect(roleIn('bod', 'people.viewer')?.scope_kind).toBeUndefined();
  });

  it('admin group carries every assignable role (full access by default)', () => {
    const admin = PERSONA_GROUPS.find((g) => g.slug === 'admin');
    const adminRoles = new Set(admin?.roles.map((r) => r.slug));
    expect(admin?.roles).toHaveLength(ASSIGNABLE_ROLES.length);
    for (const slug of ASSIGNABLE_ROLES) expect(adminRoles.has(slug)).toBe(true);
    expect(adminRoles.has('org.admin')).toBe(true);
  });
});
