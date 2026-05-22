import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';

/**
 * Fields whose changes warrant re-embedding the user profile.
 * Display name, availability, timezone etc. do not affect the embedded text.
 */
const EMBEDDED_FIELDS = new Set(['skills']);

// ── Payload shapes (local types — avoids importing identity internals) ───────

interface UserCreatedPayload {
  actor: { type: string; user_id: string | null };
  after: {
    user_id: string;
    tenant_id: string;
    email: string;
    name: string;
    created_via: string;
    sso_provider_id?: string;
  };
}

interface UserProfileUpdatedPayload {
  actor: { type: string; user_id: string | null };
  user_id: string;
  before: Partial<Record<string, unknown>>;
  after: Partial<Record<string, unknown>>;
}

interface UserDeactivatedPayload {
  actor: { type: string; user_id: string | null };
  user_id: string;
  tenant_id: string;
  deactivated_at: string;
}

// ── Internal job payload ─────────────────────────────────────────────────────

interface EmbedUserProfileJob {
  tenant_id: string;
  user_id: string;
  event_id: string;
}

// ── Shared enqueue helper ────────────────────────────────────────────────────

/**
 * Enqueues `embed_user_profile` via graphile_worker.add_job inside the subscriber
 * transaction. The job uses a deterministic jobKey so rapid back-to-back events
 * for the same user collapse into a single pending job (debounce via 'replace').
 */
async function enqueueEmbedUserProfile(
  tx: SubscriberCtx['tx'],
  job: EmbedUserProfileJob,
): Promise<void> {
  const jobKey = `embed_user_profile:${job.tenant_id}:${job.user_id}`;
  const payload = JSON.stringify(job);
  await tx.execute(
    sql`SELECT graphile_worker.add_job(
      ${'embed_user_profile'}::text,
      ${payload}::json,
      NULL::text,
      NULL::timestamp with time zone,
      ${10}::smallint,
      ${jobKey}::text,
      NULL::smallint,
      NULL::text[],
      ${'replace'}::text
    )`,
  );
}

// ── Subscriber definitions ───────────────────────────────────────────────────

export const refreshUserProfileCreatedSubscriber: SubscriberDef = {
  subscription: 'copilot.embeddings.refresh-user-profile.created',
  event: 'identity.user.created',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<UserCreatedPayload>;
    await enqueueEmbedUserProfile(ctx.tx, {
      tenant_id: e.tenantId,
      user_id: e.payload.after.user_id,
      event_id: e.id,
    });
  },
};

export const refreshUserProfileUpdatedSubscriber: SubscriberDef = {
  subscription: 'copilot.embeddings.refresh-user-profile.updated',
  event: 'identity.user.profile.updated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<UserProfileUpdatedPayload>;
    const hasEmbeddedField = Object.keys(e.payload.after).some((k) => EMBEDDED_FIELDS.has(k));
    if (!hasEmbeddedField) return;
    await enqueueEmbedUserProfile(ctx.tx, {
      tenant_id: e.tenantId,
      user_id: e.payload.user_id,
      event_id: e.id,
    });
  },
};

export const refreshUserProfileDeactivatedSubscriber: SubscriberDef = {
  subscription: 'copilot.embeddings.refresh-user-profile.deactivated',
  event: 'identity.user.deactivated',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<UserDeactivatedPayload>;
    await enqueueEmbedUserProfile(ctx.tx, {
      tenant_id: e.tenantId,
      user_id: e.payload.user_id,
      event_id: e.id,
    });
  },
};
