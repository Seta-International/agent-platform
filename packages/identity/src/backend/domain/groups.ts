import type { SessionScope } from '@seta/core';
import { invalidateUserSessions } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { ASSIGNABLE_ROLES } from '@seta/shared-rbac';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { accessGroup, accessGroupMembership, accessGroupRole } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';

export interface GroupRow {
  group_id: string;
  slug: string;
  name: string;
  kind: 'default' | 'custom';
  is_base: boolean;
  member_count: number;
  role_slugs: string[];
}

async function actorUserId(actor: Actor, tenantId: string, perm: string): Promise<string> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, perm, tenantId);
  }
  return actor.user_id ?? 'system';
}

export async function createGroup(
  input: {
    tenant_id: string;
    slug: string;
    name: string;
    description?: string;
    kind?: 'default' | 'custom';
    is_base?: boolean;
  },
  actor: Actor,
): Promise<{ group_id: string }> {
  const by = await actorUserId(actor, input.tenant_id, 'identity.group.create');
  const group_id = crypto.randomUUID();
  await withEmit({ actor: { userId: by, tenantId: input.tenant_id } }, async (tx) => {
    await tx.insert(accessGroup).values({
      id: group_id,
      tenant_id: input.tenant_id,
      slug: input.slug,
      name: input.name,
      description: input.description,
      kind: input.kind ?? 'custom',
      is_base: input.is_base ?? false,
      created_by: actor.user_id,
    });
    await emit({
      tenantId: input.tenant_id,
      aggregateType: 'identity.access_group',
      aggregateId: group_id,
      eventType: 'identity.group.created',
      eventVersion: 1,
      payload: { group_id, slug: input.slug, tenant_id: input.tenant_id },
    });
  });
  return { group_id };
}

export async function updateGroup(
  input: { group_id: string; tenant_id: string; name?: string; description?: string },
  actor: Actor,
): Promise<void> {
  const by = await actorUserId(actor, input.tenant_id, 'identity.group.update');
  await withEmit({ actor: { userId: by, tenantId: input.tenant_id } }, async (tx) => {
    await tx
      .update(accessGroup)
      .set({ name: input.name, description: input.description, updated_at: new Date() })
      .where(and(eq(accessGroup.id, input.group_id), eq(accessGroup.tenant_id, input.tenant_id)));
    await emit({
      tenantId: input.tenant_id,
      aggregateType: 'identity.access_group',
      aggregateId: input.group_id,
      eventType: 'identity.group.updated',
      eventVersion: 1,
      payload: { group_id: input.group_id },
    });
  });
}

export async function deleteGroup(
  input: { group_id: string; tenant_id: string },
  actor: Actor,
): Promise<void> {
  const by = await actorUserId(actor, input.tenant_id, 'identity.group.delete');
  let members: { user_id: string }[] = [];
  await withEmit({ actor: { userId: by, tenantId: input.tenant_id } }, async (tx) => {
    members = await tx
      .select({ user_id: accessGroupMembership.user_id })
      .from(accessGroupMembership)
      .where(eq(accessGroupMembership.group_id, input.group_id));
    await tx.delete(accessGroupRole).where(eq(accessGroupRole.group_id, input.group_id));
    await tx
      .delete(accessGroupMembership)
      .where(eq(accessGroupMembership.group_id, input.group_id));
    await tx
      .delete(accessGroup)
      .where(and(eq(accessGroup.id, input.group_id), eq(accessGroup.tenant_id, input.tenant_id)));
    await emit({
      tenantId: input.tenant_id,
      aggregateType: 'identity.access_group',
      aggregateId: input.group_id,
      eventType: 'identity.group.deleted',
      eventVersion: 1,
      payload: { group_id: input.group_id },
    });
  });
  for (const m of members) await invalidateUserSessions(m.user_id);
}

export async function setGroupRoles(
  input: { group_id: string; tenant_id: string; role_slugs: string[] },
  actor: Actor,
): Promise<void> {
  const by = await actorUserId(actor, input.tenant_id, 'identity.group.role.manage');
  const valid = new Set(ASSIGNABLE_ROLES);
  for (const r of input.role_slugs) {
    if (!valid.has(r)) throw new IdentityError('VALIDATION', `unknown role slug: ${r}`);
  }
  let members: { user_id: string }[] = [];
  await withEmit({ actor: { userId: by, tenantId: input.tenant_id } }, async (tx) => {
    members = await tx
      .select({ user_id: accessGroupMembership.user_id })
      .from(accessGroupMembership)
      .where(eq(accessGroupMembership.group_id, input.group_id));
    await tx.delete(accessGroupRole).where(eq(accessGroupRole.group_id, input.group_id));
    if (input.role_slugs.length > 0) {
      await tx
        .insert(accessGroupRole)
        .values(input.role_slugs.map((role_slug) => ({ group_id: input.group_id, role_slug })));
    }
    await emit({
      tenantId: input.tenant_id,
      aggregateType: 'identity.access_group',
      aggregateId: input.group_id,
      eventType: 'identity.group.roles.changed',
      eventVersion: 1,
      payload: { group_id: input.group_id, role_slugs: input.role_slugs },
    });
  });
  for (const m of members) await invalidateUserSessions(m.user_id);
}

export async function listGroups(session: SessionScope): Promise<GroupRow[]> {
  await requirePermission(session.user_id, 'identity.group.read', session.tenant_id);
  const db = identityDb();
  const groups = await db
    .select()
    .from(accessGroup)
    .where(eq(accessGroup.tenant_id, session.tenant_id));
  const counts = await db
    .select({ group_id: accessGroupMembership.group_id, n: sql<number>`count(*)::int` })
    .from(accessGroupMembership)
    .where(
      inArray(
        accessGroupMembership.group_id,
        groups.map((g) => g.id).length ? groups.map((g) => g.id) : [''],
      ),
    )
    .groupBy(accessGroupMembership.group_id);
  const roles = await db
    .select()
    .from(accessGroupRole)
    .where(
      inArray(
        accessGroupRole.group_id,
        groups.map((g) => g.id).length ? groups.map((g) => g.id) : [''],
      ),
    );
  const countBy = new Map(counts.map((c) => [c.group_id, c.n]));
  const rolesBy = new Map<string, string[]>();
  for (const r of roles) rolesBy.set(r.group_id, [...(rolesBy.get(r.group_id) ?? []), r.role_slug]);
  return groups.map((g) => ({
    group_id: g.id,
    slug: g.slug,
    name: g.name,
    kind: g.kind,
    is_base: g.is_base,
    member_count: countBy.get(g.id) ?? 0,
    role_slugs: (rolesBy.get(g.id) ?? []).sort(),
  }));
}
