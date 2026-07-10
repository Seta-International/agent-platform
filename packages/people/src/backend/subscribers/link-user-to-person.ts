import { emit } from '@seta/core/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq, isNull, notExists, sql } from 'drizzle-orm';
import { PEOPLE_WORKER_USER_LINKED } from '../../events.ts';
import { userProjection, worker, workerHistory } from '../db/schema.ts';

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
      .select({ person_id: worker.person_id })
      .from(worker)
      .where(
        and(
          eq(worker.tenant_id, tenant_id),
          sql`lower(${worker.work_email}) = ${email.toLowerCase()}`,
          isNull(worker.deleted_at),
          notExists(
            ctx.tx
              .select({ one: sql`1` })
              .from(userProjection)
              .where(
                and(
                  eq(userProjection.tenant_id, tenant_id),
                  eq(userProjection.person_id, worker.person_id),
                ),
              ),
          ),
        ),
      )
      .limit(1);
    if (!w) return;

    const inserted = await ctx.tx
      .insert(userProjection)
      .values({ user_id, tenant_id, person_id: w.person_id })
      .onConflictDoNothing({ target: userProjection.user_id })
      .returning({ user_id: userProjection.user_id });
    if (inserted.length === 0) return;

    await ctx.tx.insert(workerHistory).values({
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
