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
    for (const slug of ['planner.member', 'knowledge.member', 'agent.member']) {
      expect(roleIn('member', slug)?.scope_kind).toBeUndefined();
    }
  });

  it('team-lead-pm.people.viewer is self-scoped', () => {
    expect(roleIn('team-lead-pm', 'people.viewer')?.scope_kind).toBe('self');
  });

  it("team-lead-pm's other roles stay tenant (no scope_kind override)", () => {
    for (const slug of ['pm.manager', 'planner.member', 'hiring.recruiter']) {
      expect(roleIn('team-lead-pm', slug)?.scope_kind).toBeUndefined();
    }
  });

  it('hr, pmo, am, admin roles are unscoped (tenant)', () => {
    for (const slug of ['hr', 'pmo', 'am', 'admin']) {
      const group = PERSONA_GROUPS.find((g) => g.slug === slug);
      expect(group).toBeDefined();
      for (const r of group?.roles ?? []) expect(r.scope_kind).toBeUndefined();
    }
  });

  it('bod.people.viewer stays tenant (board sees everything, an intended widening)', () => {
    expect(roleIn('bod', 'people.viewer')?.scope_kind).toBeUndefined();
  });
});
