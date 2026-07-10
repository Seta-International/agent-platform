import type { SessionScope } from '@seta/core';
import { invalidateUserSessions } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq, inArray } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { accessGroup, accessGroupMembership } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';

async function guardMembership(actor: Actor, tenantId: string): Promise<string> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.group.membership.manage', tenantId);
  }
  return actor.user_id ?? 'system';
}

async function requireGroupInTenant(groupId: string, tenantId: string): Promise<void> {
  const [g] = await identityDb()
    .select({ id: accessGroup.id })
    .from(accessGroup)
    .where(and(eq(accessGroup.id, groupId), eq(accessGroup.tenant_id, tenantId)))
    .limit(1);
  if (!g) throw new IdentityError('NOT_FOUND', `No group ${groupId} in tenant ${tenantId}`);
}

export async function addGroupMembers(
  input: { group_id: string; tenant_id: string; user_ids: string[] },
  actor: Actor,
): Promise<void> {
  const by = await guardMembership(actor, input.tenant_id);
  await requireGroupInTenant(input.group_id, input.tenant_id);
  if (input.user_ids.length === 0) return;
  await withEmit({ actor: { userId: by, tenantId: input.tenant_id } }, async (tx) => {
    await tx
      .insert(accessGroupMembership)
      .values(
        input.user_ids.map((user_id) => ({
          tenant_id: input.tenant_id,
          group_id: input.group_id,
          user_id,
          added_by: actor.user_id,
        })),
      )
      .onConflictDoNothing();
    await emit({
      tenantId: input.tenant_id,
      aggregateType: 'identity.access_group',
      aggregateId: input.group_id,
      eventType: 'identity.group.membership.added',
      eventVersion: 1,
      payload: { group_id: input.group_id, user_ids: input.user_ids },
    });
  });
  for (const u of input.user_ids) await invalidateUserSessions(u);
}

export async function removeGroupMember(
  input: { group_id: string; tenant_id: string; user_id: string },
  actor: Actor,
): Promise<void> {
  const by = await guardMembership(actor, input.tenant_id);
  await requireGroupInTenant(input.group_id, input.tenant_id);
  await withEmit({ actor: { userId: by, tenantId: input.tenant_id } }, async (tx) => {
    await tx
      .delete(accessGroupMembership)
      .where(
        and(
          eq(accessGroupMembership.group_id, input.group_id),
          eq(accessGroupMembership.user_id, input.user_id),
        ),
      );
    await emit({
      tenantId: input.tenant_id,
      aggregateType: 'identity.access_group',
      aggregateId: input.group_id,
      eventType: 'identity.group.membership.removed',
      eventVersion: 1,
      payload: { group_id: input.group_id, user_id: input.user_id },
    });
  });
  await invalidateUserSessions(input.user_id);
}

export async function listGroupMembers(
  session: SessionScope,
  group_id: string,
): Promise<{ user_id: string }[]> {
  await requirePermission(session.user_id, 'identity.group.read', session.tenant_id);
  return identityDb()
    .select({ user_id: accessGroupMembership.user_id })
    .from(accessGroupMembership)
    .innerJoin(accessGroup, eq(accessGroup.id, accessGroupMembership.group_id))
    .where(
      and(
        eq(accessGroupMembership.group_id, group_id),
        eq(accessGroup.tenant_id, session.tenant_id),
      ),
    );
}

export async function listUserGroups(
  session: SessionScope,
  user_id: string,
): Promise<{ group_id: string; slug: string; name: string }[]> {
  await requirePermission(session.user_id, 'identity.group.read', session.tenant_id);
  return identityDb()
    .select({ group_id: accessGroup.id, slug: accessGroup.slug, name: accessGroup.name })
    .from(accessGroupMembership)
    .innerJoin(accessGroup, eq(accessGroup.id, accessGroupMembership.group_id))
    .where(
      and(eq(accessGroupMembership.user_id, user_id), eq(accessGroup.tenant_id, session.tenant_id)),
    );
}

/**
 * Batch group-name lookup for a set of users in one tenant — API composition for callers
 * (e.g. the People directory) that need group summaries for a page of users without
 * looping single-user calls or joining across schemas.
 */
export async function listGroupNamesForUsers(
  session: SessionScope,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (userIds.length === 0) return map;
  const rows = await identityDb()
    .select({ user_id: accessGroupMembership.user_id, name: accessGroup.name })
    .from(accessGroupMembership)
    .innerJoin(accessGroup, eq(accessGroup.id, accessGroupMembership.group_id))
    .where(
      and(
        eq(accessGroup.tenant_id, session.tenant_id),
        inArray(accessGroupMembership.user_id, userIds),
      ),
    )
    .orderBy(accessGroup.name);
  for (const r of rows) {
    const existing = map.get(r.user_id) ?? [];
    existing.push(r.name);
    map.set(r.user_id, existing);
  }
  return map;
}
