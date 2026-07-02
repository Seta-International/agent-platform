import type { SessionScope } from '@seta/core';
import { type Actor, createGroup, listGroups, setGroupRoles } from '@seta/identity';

export interface PersonaRoleDef {
  slug: string;
  scope_kind?: 'tenant' | 'org_unit' | 'self';
  scope_id?: string;
}

export interface PersonaGroupDef {
  slug: string;
  name: string;
  is_base?: boolean;
  roles: PersonaRoleDef[];
}

export const PERSONA_GROUPS: PersonaGroupDef[] = [
  {
    slug: 'member',
    name: 'Member',
    is_base: true,
    roles: [
      { slug: 'planner.member' },
      { slug: 'knowledge.member' },
      { slug: 'agent.member' },
      { slug: 'people.viewer', scope_kind: 'self' },
    ],
  },
  {
    slug: 'hr',
    name: 'HR',
    roles: [
      { slug: 'people.manager' },
      { slug: 'hiring.manager' },
      { slug: 'hiring.recruiter', scope_kind: 'self' },
    ],
  },
  { slug: 'pmo', name: 'PMO', roles: [{ slug: 'pm.pmo' }] },
  { slug: 'am', name: 'AM', roles: [{ slug: 'pm.manager' }] },
  {
    slug: 'bod',
    name: 'BoD',
    roles: [{ slug: 'pm.bod' }, { slug: 'people.viewer' }, { slug: 'hiring.viewer' }],
  },
  {
    slug: 'team-lead-pm',
    name: 'Team Lead/PM',
    roles: [
      { slug: 'pm.manager' },
      { slug: 'planner.member' },
      { slug: 'people.viewer', scope_kind: 'self' },
      { slug: 'hiring.recruiter', scope_kind: 'self' },
    ],
  },
  { slug: 'admin', name: 'Admin', roles: [{ slug: 'org.admin' }, { slug: 'identity.admin' }] },
];

/** Create-or-reuse a group by slug and (re)write its role grants. Shared by persona groups and
 * one-off scoped groups (e.g. the fixture's per-unit delivery-lead groups). */
export async function ensureScopedGroup(
  session: SessionScope,
  actor: Actor,
  def: { slug: string; name: string; is_base?: boolean; roles: PersonaRoleDef[] },
  existingBySlug: Map<string, string>,
): Promise<string> {
  let id = existingBySlug.get(def.slug);
  if (!id) {
    ({ group_id: id } = await createGroup(
      {
        tenant_id: session.tenant_id,
        slug: def.slug,
        name: def.name,
        kind: 'default',
        is_base: def.is_base ?? false,
      },
      actor,
    ));
  }
  await setGroupRoles(
    {
      group_id: id,
      tenant_id: session.tenant_id,
      roles: def.roles.map((r) => ({
        role_slug: r.slug,
        scope_kind: r.scope_kind ?? 'tenant',
        scope_id: r.scope_id ?? null,
      })),
    },
    actor,
  );
  return id;
}

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
    out.set(g.slug, await ensureScopedGroup(session, actor, g, bySlug));
  }
  return out;
}
