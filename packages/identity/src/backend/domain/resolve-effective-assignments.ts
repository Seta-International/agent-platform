import { and, eq, isNull } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import {
  accessGroup,
  accessGroupMembership,
  accessGroupRole,
  roleAssignments,
} from '../db/schema.ts';

export interface EffectiveAssignment {
  role_slug: string;
  scope_kind: 'tenant' | 'org_unit' | 'self';
  scope_id: string | null;
}

const key = (a: EffectiveAssignment): string =>
  `${a.role_slug}|${a.scope_kind}|${a.scope_id ?? ''}`;

export async function resolveEffectiveAssignments(
  userId: string,
  tenantId: string,
): Promise<EffectiveAssignment[]> {
  const db = identityDb();

  const direct = await db
    .select({
      role_slug: roleAssignments.role_slug,
      scope_kind: roleAssignments.scope_kind,
      scope_id: roleAssignments.scope_id,
    })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.user_id, userId),
        eq(roleAssignments.tenant_id, tenantId),
        isNull(roleAssignments.revoked_at),
      ),
    );

  const viaGroups = await db
    .select({
      role_slug: accessGroupRole.role_slug,
      scope_kind: accessGroupRole.scope_kind,
      scope_id: accessGroupRole.scope_id,
    })
    .from(accessGroupMembership)
    .innerJoin(accessGroup, eq(accessGroup.id, accessGroupMembership.group_id))
    .innerJoin(accessGroupRole, eq(accessGroupRole.group_id, accessGroup.id))
    .where(and(eq(accessGroupMembership.user_id, userId), eq(accessGroup.tenant_id, tenantId)));

  const out = new Map<string, EffectiveAssignment>();
  for (const a of [...direct, ...viaGroups]) out.set(key(a), a);
  return [...out.values()].sort((x, y) => key(x).localeCompare(key(y)));
}

export function toRoleSlugs(assignments: readonly EffectiveAssignment[]): string[] {
  return [...new Set(assignments.map((a) => a.role_slug))].sort();
}
