import { emit, withEmit } from '@seta/core/events';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { identityDb } from '../db/index.ts';
import { roleGrants, user } from '../db/schema.ts';
import { IdentityError, requirePermission } from '../rbac.ts';
import type { Actor } from './create-user.ts';

const MAX_BULK = 500;

export interface BulkRoleInput {
  user_ids: string[];
  tenant_id: string;
  role_slug: string;
  scope_type: 'tenant' | 'group';
  scope_id: string | null;
}

export interface BulkRoleResult {
  granted: number;
  revoked: number;
  skipped: number;
  failed: { user_id: string; reason: string }[];
}

async function authorize(actor: Actor, tenantId: string): Promise<void> {
  if (actor.type === 'user') {
    if (!actor.user_id) throw new IdentityError('FORBIDDEN', 'user actor requires user_id');
    await requirePermission(actor.user_id, 'identity.role.grant', tenantId);
  }
}

async function tenantUserSet(tenantId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await identityDb()
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.tenant_id, tenantId), inArray(user.id, ids)));
  return new Set(rows.map((r) => r.id));
}

export async function bulkGrantRole(input: BulkRoleInput, actor: Actor): Promise<BulkRoleResult> {
  if (input.user_ids.length > MAX_BULK)
    throw new IdentityError('VALIDATION', `max ${MAX_BULK} users per call`);
  await authorize(actor, input.tenant_id);

  const valid = await tenantUserSet(input.tenant_id, input.user_ids);
  const existing =
    valid.size === 0
      ? []
      : await identityDb()
          .select({ user_id: roleGrants.user_id })
          .from(roleGrants)
          .where(
            and(
              eq(roleGrants.tenant_id, input.tenant_id),
              eq(roleGrants.role_slug, input.role_slug),
              eq(roleGrants.scope_type, input.scope_type),
              isNull(roleGrants.revoked_at),
              inArray(roleGrants.user_id, [...valid]),
            ),
          );
  const held = new Set(existing.map((r) => r.user_id));
  const result: BulkRoleResult = { granted: 0, revoked: 0, skipped: 0, failed: [] };
  const grantedVia: 'cli' | 'admin' = actor.type === 'cli' ? 'cli' : 'admin';

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
      for (const uid of input.user_ids) {
        if (!valid.has(uid)) {
          result.failed.push({ user_id: uid, reason: 'not_in_tenant' });
          continue;
        }
        if (held.has(uid)) {
          result.skipped++;
          continue;
        }
        const grantId = crypto.randomUUID();
        await tx.insert(roleGrants).values({
          id: grantId,
          user_id: uid,
          tenant_id: input.tenant_id,
          role_slug: input.role_slug,
          scope_type: input.scope_type,
          scope_id: input.scope_id,
          granted_by: actor.user_id,
          granted_via: grantedVia,
        });
        await emit({
          tenantId: input.tenant_id,
          aggregateType: 'identity.user',
          aggregateId: uid,
          eventType: 'identity.role_grant.changed',
          eventVersion: 1,
          payload: {
            actor: {
              type: actor.type,
              user_id: actor.user_id,
              ip: actor.ip,
              user_agent: actor.user_agent,
            },
            user_id: uid,
            tenant_id: input.tenant_id,
            change: 'granted',
            grant: {
              grant_id: grantId,
              role_slug: input.role_slug,
              scope_type: input.scope_type,
              scope_id: input.scope_id,
              granted_via: grantedVia,
            },
          },
        });
        result.granted++;
      }
    },
  );

  return result;
}

export async function bulkRevokeRole(input: BulkRoleInput, actor: Actor): Promise<BulkRoleResult> {
  if (input.user_ids.length > MAX_BULK)
    throw new IdentityError('VALIDATION', `max ${MAX_BULK} users per call`);
  await authorize(actor, input.tenant_id);

  const rows = await identityDb()
    .select()
    .from(roleGrants)
    .where(
      and(
        eq(roleGrants.tenant_id, input.tenant_id),
        eq(roleGrants.role_slug, input.role_slug),
        eq(roleGrants.scope_type, input.scope_type),
        isNull(roleGrants.revoked_at),
        inArray(roleGrants.user_id, input.user_ids),
      ),
    );
  const byUser = new Map(rows.map((r) => [r.user_id, r]));
  const result: BulkRoleResult = { granted: 0, revoked: 0, skipped: 0, failed: [] };

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
      for (const uid of input.user_ids) {
        const g = byUser.get(uid);
        if (!g) {
          result.skipped++;
          continue;
        }
        await tx
          .update(roleGrants)
          .set({ revoked_at: new Date(), revoked_by: actor.user_id })
          .where(and(eq(roleGrants.id, g.id), isNull(roleGrants.revoked_at)));
        await emit({
          tenantId: input.tenant_id,
          aggregateType: 'identity.user',
          aggregateId: uid,
          eventType: 'identity.role_grant.changed',
          eventVersion: 1,
          payload: {
            actor: {
              type: actor.type,
              user_id: actor.user_id,
              ip: actor.ip,
              user_agent: actor.user_agent,
            },
            user_id: uid,
            tenant_id: input.tenant_id,
            change: 'revoked',
            grant: {
              grant_id: g.id,
              role_slug: g.role_slug,
              scope_type: g.scope_type,
              scope_id: g.scope_id,
              granted_via: g.granted_via,
            },
          },
        });
        result.revoked++;
      }
    },
  );

  return result;
}
