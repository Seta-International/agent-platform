import { emit } from '@seta/core/events';
import type { DomainEvent, SubscriberCtx } from '@seta/shared-types';
import { ensureGroupViewerGrant } from '../domain/ensure-group-viewer-grant.ts';

// Local payload types — no import from @seta/planner to preserve module boundary.
interface MemberAddedPayload {
  actor: { type: string; user_id: string | null };
  group_id: string;
  user_id: string;
}

interface MemberRemovedPayload {
  actor: { type: string; user_id: string | null };
  group_id: string;
  user_id: string;
}

/**
 * Resolve the underlying pg PoolClient from either a Drizzle NodeTx (production)
 * or a raw PoolClient passed directly (integration tests via `as never` cast).
 */
function pgClient(tx: SubscriberCtx['tx']): {
  query(text: string, values?: unknown[]): Promise<unknown>;
} {
  // In production: ctx.tx is a Drizzle NodePgDatabase whose session wraps a PoolClient.
  const session = (tx as unknown as { session?: { client?: unknown } }).session;
  if (session?.client) {
    return session.client as { query(text: string, values?: unknown[]): Promise<unknown> };
  }
  // In tests: ctx.tx is cast as `never` but is actually a raw pg PoolClient.
  return tx as unknown as { query(text: string, values?: unknown[]): Promise<unknown> };
}

export async function applyMemberAdded(
  e: DomainEvent<MemberAddedPayload>,
  _ctx: SubscriberCtx,
): Promise<void> {
  await ensureGroupViewerGrant({
    tenant_id: e.tenantId,
    user_id: e.payload.user_id,
    group_id: e.payload.group_id,
    granted_by: e.payload.actor.user_id ?? null,
  });

  const grantId = crypto.randomUUID();
  await emit({
    tenantId: e.tenantId,
    aggregateType: 'identity.user',
    aggregateId: e.payload.user_id,
    eventType: 'identity.role_grant.changed',
    eventVersion: 1,
    payload: {
      actor: { type: e.payload.actor.type, user_id: e.payload.actor.user_id },
      user_id: e.payload.user_id,
      tenant_id: e.tenantId,
      change: 'granted',
      grant: {
        grant_id: grantId,
        role_slug: 'planner.viewer',
        scope_kind: 'group',
        scope_id: e.payload.group_id,
        granted_via: 'admin',
      },
    },
  });
}

export async function applyMemberRemoved(
  e: DomainEvent<MemberRemovedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  await pgClient(ctx.tx).query(
    `UPDATE identity.role_assignments
     SET revoked_at = NOW(), revoked_by = $1
     WHERE user_id   = $2
       AND scope_kind = 'group'
       AND scope_id   = $3
       AND revoked_at IS NULL`,
    [e.payload.actor.user_id ?? null, e.payload.user_id, e.payload.group_id],
  );

  // Emit so core.session-invalidate-by-grant flushes the member's stale session scope cache.
  await emit({
    tenantId: e.tenantId,
    aggregateType: 'identity.user',
    aggregateId: e.payload.user_id,
    eventType: 'identity.role_grant.changed',
    eventVersion: 1,
    payload: {
      actor: { type: e.payload.actor.type, user_id: e.payload.actor.user_id },
      user_id: e.payload.user_id,
      tenant_id: e.tenantId,
      change: 'revoked',
    },
  });
}
