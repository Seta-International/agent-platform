import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { sql } from 'drizzle-orm';

// ── Payload shapes ────────────────────────────────────────────────────────────

interface PersonSkillEventPayload {
  person_id: string;
  skill_id: string;
  tenant_id: string;
}

// ── Internal job payload ─────────────────────────────────────────────────────

interface EmbedPersonProfileJob {
  tenant_id: string;
  person_id: string;
  event_id: string;
}

// ── Shared enqueue helper ────────────────────────────────────────────────────

/**
 * Enqueues `embed_person_profile` via graphile_worker.add_job inside the subscriber
 * transaction. Deterministic jobKey collapses rapid events for the same person.
 */
async function enqueueEmbedPersonProfile(
  tx: SubscriberCtx['tx'],
  job: EmbedPersonProfileJob,
): Promise<void> {
  const jobKey = `embed_person_profile:${job.tenant_id}:${job.person_id}`;
  const payload = JSON.stringify(job);
  await tx.execute(
    sql`SELECT graphile_worker.add_job(
      ${'embed_person_profile'}::text,
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

export const refreshPersonSkillAddedSubscriber: SubscriberDef = {
  subscription: 'people.embeddings.refresh-person-profile.skill-added',
  event: 'people.person.skill.added',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<PersonSkillEventPayload>;
    await enqueueEmbedPersonProfile(ctx.tx, {
      tenant_id: e.tenantId,
      person_id: e.payload.person_id,
      event_id: e.id,
    });
  },
};

export const refreshPersonSkillRemovedSubscriber: SubscriberDef = {
  subscription: 'people.embeddings.refresh-person-profile.skill-removed',
  event: 'people.person.skill.removed',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<PersonSkillEventPayload>;
    await enqueueEmbedPersonProfile(ctx.tx, {
      tenant_id: e.tenantId,
      person_id: e.payload.person_id,
      event_id: e.id,
    });
  },
};
