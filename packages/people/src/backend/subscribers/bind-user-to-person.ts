import { emit } from '@seta/core/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { PEOPLE_WORKER_USER_LINKED } from '../../events.ts';
import { person, worker, workerHistory } from '../db/schema.ts';

interface UserCreatedPayload {
  after: { user_id: string; tenant_id: string; email: string; name: string };
}

export const bindUserToPerson: SubscriberDef = {
  subscription: 'people.person-link.user-created',
  event: 'identity.user.created',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<UserCreatedPayload>;
    const { user_id, tenant_id, email } = e.payload.after;

    const [w] = await ctx.tx
      .select({ person_id: worker.person_id })
      .from(worker)
      .innerJoin(person, eq(person.id, worker.person_id))
      .where(
        and(
          eq(worker.tenant_id, tenant_id),
          sql`lower(${worker.work_email}) = ${email.toLowerCase()}`,
          isNull(worker.deleted_at),
          isNull(person.user_id),
        ),
      )
      .limit(1);
    if (!w) return; // no unlinked worker — never create a person

    await ctx.tx
      .update(person)
      .set({ user_id, updated_at: new Date() })
      .where(and(eq(person.id, w.person_id), isNull(person.user_id)));

    await ctx.tx.insert(workerHistory).values({
      tenant_id,
      person_id: w.person_id,
      action: 'user_linked',
      by_user_id: user_id,
    });

    // worker_id convention across the codebase is person.id (see insert-worker-aggregate.ts) —
    // there is no separate worker.id in use anywhere else, so we follow that here too.
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
