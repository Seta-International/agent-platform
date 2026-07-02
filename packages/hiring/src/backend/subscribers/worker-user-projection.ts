import { PEOPLE_WORKER_USER_LINKED, type WorkerUserLinkedPayload } from '@seta/people/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { workerUserProjection } from '../db/schema.ts';

// Local {worker_id -> user_id} read-model so hiring can resolve session.user_id -> worker_id
// for AM row scoping (FUT-327) without a cross-module join.
export const workerUserProjectionLinked: SubscriberDef = {
  subscription: 'hiring.worker-user-projection.linked',
  event: PEOPLE_WORKER_USER_LINKED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<WorkerUserLinkedPayload>;
    const { worker_id, tenant_id, user_id } = e.payload;
    await ctx.tx
      .insert(workerUserProjection)
      .values({ worker_id, tenant_id, user_id })
      .onConflictDoUpdate({
        target: workerUserProjection.worker_id,
        set: { tenant_id, user_id },
      });
  },
};
