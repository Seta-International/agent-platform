import { describe, expect, it } from 'vitest';
import { rolesFor, skillsFor } from '../../src/commands/seed-fixture/rbac-map.ts';

describe('rolesFor', () => {
  it('ADMIN → org.admin only', () => {
    const grants = rolesFor('ADMIN');
    expect(grants.map((g) => g.slug)).toEqual(['org.admin']);
    expect(grants[0]).toMatchObject({ scope_type: 'tenant', scope_id: null });
  });

  it('PM → pm.strategic + planner.contributor + agent.contributor', () => {
    const slugs = rolesFor('PM').map((g) => g.slug);
    expect(slugs).toContain('pm.strategic');
    expect(slugs).toContain('planner.contributor');
    expect(slugs).toContain('agent.contributor');
    expect(slugs).not.toContain('pm.viewer');
  });

  it('DEV → planner.contributor + knowledge.member + agent.contributor', () => {
    const slugs = rolesFor('DEV').map((g) => g.slug);
    expect(slugs).toContain('planner.contributor');
    expect(slugs).toContain('knowledge.member');
    expect(slugs).toContain('agent.contributor');
  });

  it('case-insensitive: admin (lowercase) maps same as ADMIN', () => {
    expect(rolesFor('admin').map((g) => g.slug)).toEqual(['org.admin']);
  });

  it('MARKETING → planner.viewer + knowledge.member', () => {
    const slugs = rolesFor('MARKETING').map((g) => g.slug);
    expect(slugs).toContain('planner.viewer');
    expect(slugs).toContain('knowledge.member');
  });

  it('DIRECTOR → pm.strategic + agent.contributor', () => {
    const slugs = rolesFor('DIRECTOR').map((g) => g.slug);
    expect(slugs).toContain('pm.strategic');
    expect(slugs).toContain('agent.contributor');
  });

  it('unknown role falls back to IC default', () => {
    const slugs = rolesFor('RANDOM_ROLE').map((g) => g.slug);
    expect(slugs).toContain('planner.contributor');
    expect(slugs).toContain('knowledge.member');
    expect(slugs).toContain('agent.contributor');
  });
});

describe('skillsFor', () => {
  it('QA roles get qa skills', () => {
    expect(skillsFor('QA')).toContain('qa');
    expect(skillsFor('QA Auto')).toContain('automation');
  });

  it('DEV gets typescript + react + node', () => {
    const skills = skillsFor('DEV');
    expect(skills).toContain('typescript');
    expect(skills).toContain('react');
    expect(skills).toContain('node');
  });

  it('DEVOPS gets devops skills', () => {
    expect(skillsFor('DEVOPS')).toContain('devops');
  });

  it('PM gets project-management skills', () => {
    expect(skillsFor('PM')).toContain('project-management');
  });

  it('unknown returns general', () => {
    expect(skillsFor('WIZARD')).toEqual(['general']);
  });
});
