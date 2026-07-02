import type { SessionScope } from '@seta/core';
import { type Actor, createGroup, listGroups, setGroupRoles } from '@seta/identity';

export interface PersonaGroupDef {
  slug: string;
  name: string;
  is_base?: boolean;
  roles: string[];
}

export const PERSONA_GROUPS: PersonaGroupDef[] = [
  {
    slug: 'member',
    name: 'Member',
    is_base: true,
    roles: ['planner.member', 'knowledge.member', 'agent.member'],
  },
  { slug: 'hr', name: 'HR', roles: ['people.manager', 'hiring.manager', 'hiring.recruiter'] },
  { slug: 'pmo', name: 'PMO', roles: ['pm.pmo'] },
  { slug: 'am', name: 'AM', roles: ['pm.manager'] },
  { slug: 'bod', name: 'BoD', roles: ['pm.bod', 'people.viewer', 'hiring.viewer'] },
  {
    slug: 'team-lead-pm',
    name: 'Team Lead/PM',
    roles: ['pm.manager', 'planner.member', 'people.viewer', 'hiring.recruiter'],
  },
  { slug: 'admin', name: 'Admin', roles: ['org.admin', 'identity.admin'] },
];

export async function ensurePersonaGroups(
  session: SessionScope,
  actor: Actor,
  slugs?: string[],
): Promise<Map<string, string>> {
  const want = slugs ? PERSONA_GROUPS.filter((g) => slugs.includes(g.slug)) : PERSONA_GROUPS;
  const existing = await listGroups(session);
  const bySlug = new Map(existing.map((g) => [g.slug, g.group_id] as const));
  const out = new Map<string, string>();
  for (const g of want) {
    let id = bySlug.get(g.slug);
    if (!id) {
      ({ group_id: id } = await createGroup(
        {
          tenant_id: session.tenant_id,
          slug: g.slug,
          name: g.name,
          kind: 'default',
          is_base: g.is_base ?? false,
        },
        actor,
      ));
    }
    await setGroupRoles({ group_id: id, tenant_id: session.tenant_id, role_slugs: g.roles }, actor);
    out.set(g.slug, id);
  }
  return out;
}
