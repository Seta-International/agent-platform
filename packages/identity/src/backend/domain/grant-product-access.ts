import { invalidateTenantSessions, invalidateUserSessions, type SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { can, PRODUCT_NAMESPACES } from '@seta/shared-rbac';
import { and, eq, inArray } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { productGrant } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';
import { listUserGroupIds } from './list-role-grants.ts';
import { resolveEffectiveRoleSlugs } from './resolve-effective-roles.ts';
import { resolveTenantProducts } from './resolve-product-access.ts';

export interface GrantProductAccessInput {
  tenant_id: string;
  subject_type: 'tenant' | 'group' | 'user';
  subject_id: string;
  product_id: string;
  effect?: 'grant' | 'revoke';
  granted_via?: 'admin' | 'seed' | 'cli';
}

export async function grantProductAccess(
  input: GrantProductAccessInput,
  actor: Actor,
): Promise<void> {
  const effect = input.effect ?? 'grant';

  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    const permission =
      effect === 'revoke' ? 'identity.product_access.revoke' : 'identity.product_access.grant';
    await requirePermission(actor.user_id, permission, input.tenant_id);
  }

  const granted_via = input.granted_via ?? (actor.type === 'cli' ? 'cli' : 'admin');

  await withEmit(
    {
      actor: {
        userId: actor.user_id ?? 'system',
        tenantId: input.tenant_id,
        ip: actor.ip,
        userAgent: actor.user_agent,
      },
    },
    async (tx) => {
      await tx
        .insert(productGrant)
        .values({
          tenant_id: input.tenant_id,
          subject_type: input.subject_type,
          subject_id: input.subject_id,
          product_id: input.product_id,
          effect,
          granted_by: actor.user_id ?? null,
          granted_via,
        })
        .onConflictDoUpdate({
          target: [productGrant.subject_type, productGrant.subject_id, productGrant.product_id],
          set: {
            effect,
            granted_by: actor.user_id ?? null,
            granted_via,
          },
        });

      await emit({
        tenantId: input.tenant_id,
        aggregateType: 'identity.user',
        aggregateId: input.subject_type === 'user' ? input.subject_id : input.tenant_id,
        eventType:
          effect === 'revoke'
            ? 'identity.product_access.revoked'
            : 'identity.product_access.granted',
        eventVersion: 1,
        payload: {
          actor: {
            type: actor.type,
            user_id: actor.user_id,
            ip: actor.ip,
            user_agent: actor.user_agent,
          },
          tenant_id: input.tenant_id,
          subject_type: input.subject_type,
          subject_id: input.subject_id,
          product_id: input.product_id,
          effect,
          granted_via,
        },
      });
    },
  );

  if (input.subject_type === 'user') {
    await invalidateUserSessions(input.subject_id);
  } else {
    await invalidateTenantSessions(input.tenant_id);
  }
}

export async function listProductAccess(
  session: SessionScope,
  user_id: string,
): Promise<
  { product_id: string; source: 'tenant' | 'role' | 'group' | 'user'; effect: 'grant' | 'revoke' }[]
> {
  if (!can(session, 'identity.product_access.read')) {
    throw new IdentityError('FORBIDDEN', 'Missing permission: identity.product_access.read');
  }

  const result: {
    product_id: string;
    source: 'tenant' | 'role' | 'group' | 'user';
    effect: 'grant' | 'revoke';
  }[] = [];

  const tenantProducts = await resolveTenantProducts(session.tenant_id);
  for (const product_id of tenantProducts) {
    result.push({ product_id, source: 'tenant', effect: 'grant' });
  }

  const roles = await resolveEffectiveRoleSlugs(user_id, session.tenant_id);
  for (const r of roles) {
    const ns = r.split('.')[0];
    if (ns && PRODUCT_NAMESPACES.has(ns)) {
      result.push({ product_id: ns, source: 'role', effect: 'grant' });
    }
  }

  const groupIds = await listUserGroupIds(user_id);
  if (groupIds.length > 0) {
    const groupGrants = await identityDb()
      .select({ product_id: productGrant.product_id, effect: productGrant.effect })
      .from(productGrant)
      .where(
        and(
          eq(productGrant.tenant_id, session.tenant_id),
          eq(productGrant.subject_type, 'group'),
          inArray(productGrant.subject_id, groupIds),
        ),
      );
    for (const g of groupGrants) {
      result.push({ product_id: g.product_id, source: 'group', effect: g.effect });
    }
  }

  const userGrants = await identityDb()
    .select({ product_id: productGrant.product_id, effect: productGrant.effect })
    .from(productGrant)
    .where(
      and(
        eq(productGrant.tenant_id, session.tenant_id),
        eq(productGrant.subject_type, 'user'),
        eq(productGrant.subject_id, user_id),
      ),
    );
  for (const g of userGrants) {
    result.push({ product_id: g.product_id, source: 'user', effect: g.effect });
  }

  return result;
}
