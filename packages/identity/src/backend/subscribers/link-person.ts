import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq, isNull } from 'drizzle-orm';
import { user } from '../db/schema.ts';

interface WorkerUserLinkedPayload {
  worker_id: string;
  person_id: string;
  user_id: string;
  tenant_id: string;
}

const linkPerson: SubscriberDef = {
  subscription: 'identity.user.link-person',
  event: 'people.worker.user_linked',
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<WorkerUserLinkedPayload>;
    const { user_id, person_id, tenant_id } = e.payload;
    // isNull guard: at-least-once delivery must not re-point an already-linked
    // user at a different person on redelivery or a stale replay.
    await ctx.tx
      .update(user)
      .set({ person_id })
      .where(and(eq(user.id, user_id), eq(user.tenant_id, tenant_id), isNull(user.person_id)));
  },
};

export const linkPersonSubscriber = linkPerson;
export const linkPersonSubscribers: SubscriberDef[] = [linkPerson];
