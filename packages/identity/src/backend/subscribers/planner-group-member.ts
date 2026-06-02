import type { DomainEvent, SubscriberCtx } from '@seta/shared-types';

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
  ctx: SubscriberCtx,
): Promise<void> {
  // Idempotent upsert: ON CONFLICT DO NOTHING if a non-revoked grant already exists.
  await pgClient(ctx.tx).query(
    `INSERT INTO identity.role_grants
       (id, tenant_id, user_id, role_slug, scope_type, scope_id, granted_by, granted_via)
     VALUES
       (gen_random_uuid(), $1, $2, 'planner.viewer', 'group', $3, $4, 'admin')
     ON CONFLICT DO NOTHING`,
    [e.tenantId, e.payload.user_id, e.payload.group_id, e.payload.actor.user_id ?? null],
  );
}

export async function applyMemberRemoved(
  e: DomainEvent<MemberRemovedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  await pgClient(ctx.tx).query(
    `UPDATE identity.role_grants
     SET revoked_at = NOW(), revoked_by = $1
     WHERE user_id   = $2
       AND scope_type = 'group'
       AND scope_id   = $3
       AND revoked_at IS NULL`,
    [e.payload.actor.user_id ?? null, e.payload.user_id, e.payload.group_id],
  );
}
