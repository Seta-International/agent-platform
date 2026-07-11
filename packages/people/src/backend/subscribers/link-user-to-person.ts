import { emit } from '@seta/core/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq, isNull, notExists, sql } from 'drizzle-orm';
import { PEOPLE_WORKER_USER_LINKED } from '../../events.ts';
import { person, personHistory, userProjection } from '../db/schema.ts';

interface UserCreatedPayload {
  after: { user_id: string; tenant_id: string; email: string; name: string };
}

export const linkUserToPerson: SubscriberDef = {
  subscription: 'people.person-link.user-created',
  event: 'identity.user.created',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<UserCreatedPayload>;
    const { user_id, tenant_id, email } = e.payload.after;

    const [w] = await ctx.tx
      .select({ person_id: person.id })
      .from(person)
      .where(
        and(
          eq(person.tenant_id, tenant_id),
          sql`lower(${person.work_email}) = ${email.toLowerCase()}`,
          isNull(person.deleted_at),
          notExists(
            ctx.tx
              .select({ one: sql`1` })
              .from(userProjection)
              .where(
                and(
                  eq(userProjection.tenant_id, tenant_id),
                  eq(userProjection.person_id, person.id),
                ),
              ),
          ),
        ),
      )
      .limit(1);
    if (!w) return;

    // No arbiter: a redelivered event collides on the user_id PK, and a second user racing the
    // same worker collides on user_projection_uniq_person (tenant_id, person_id). ON CONFLICT
    // DO NOTHING only suppresses a violation on its named arbiter — naming user_id would let the
    // uniq_person violation raise 23505 instead of no-opping. Unqualified DO NOTHING takes the
    // empty-returning early exit for BOTH races: idempotent redelivery and refuse-to-steal.
    const inserted = await ctx.tx
      .insert(userProjection)
      .values({ user_id, tenant_id, person_id: w.person_id })
      .onConflictDoNothing()
      .returning({ user_id: userProjection.user_id });
    if (inserted.length === 0) return;

    await ctx.tx.insert(personHistory).values({
      tenant_id,
      person_id: w.person_id,
      action: 'user_linked',
      by_user_id: user_id,
    });

    await emit({
      tenantId: tenant_id,
      aggregateType: 'people.worker',
      aggregateId: w.person_id,
      eventType: PEOPLE_WORKER_USER_LINKED,
      eventVersion: 1,
      payload: { worker_id: w.person_id, person_id: w.person_id, user_id, tenant_id },
    });
  },
};
