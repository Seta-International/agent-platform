import type { SessionScope } from '@seta/core';
import { type Actor, createGroup, listGroups, setGroupRoles } from '@seta/identity';
import { ASSIGNABLE_ROLES } from '@seta/shared-rbac';

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
      { slug: 'agent.member', scope_kind: 'self' },
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
  // AM reach is relationship-derived: pm.manager at self scope activates the account/lead arms in
  // pm's scope-builder, so an AM sees only projects on accounts they manage or lead — not the whole
  // tenant/org unit. Widen a specific AM by additionally granting pm.manager @ org_unit.
  { slug: 'am', name: 'AM', roles: [{ slug: 'pm.manager', scope_kind: 'self' }] },
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
  // Admin gets every assignable role at tenant scope so the seeded Admin group has full access by
  // default (org.admin alone is already a permission wildcard; the explicit set keeps the /admin/groups
  // view complete and stays in sync as modules add roles).
  { slug: 'admin', name: 'Admin', roles: ASSIGNABLE_ROLES.map((slug) => ({ slug })) },
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
