import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { personProjection } from '../db/schema.ts';

// Local event contract — no import from @seta/people to preserve the module boundary
// (People already depends on @seta/pm; importing back would create a package cycle).
export const PEOPLE_WORKER_CREATED = 'people.worker.created';
export const PEOPLE_WORKER_UPDATED = 'people.worker.updated';

export interface PeopleWorkerProjected {
  worker_id: string;
  tenant_id: string;
  full_name: string;
  job_title: string | null;
}

function projectWorker(eventType: string): SubscriberDef {
  return {
    subscription: `pm.worker-projection.${eventType === PEOPLE_WORKER_CREATED ? 'created' : 'updated'}`,
    event: eventType,
    eventVersion: 1,
    handler: async (event, ctx) => {
      const { worker_id, tenant_id, full_name, job_title } = (
        event as DomainEvent<PeopleWorkerProjected>
      ).payload;
      await ctx.tx
        .insert(personProjection)
        .values({ person_id: worker_id, tenant_id, full_name, job_title: job_title ?? null })
        .onConflictDoUpdate({
          target: personProjection.person_id,
          set: { tenant_id, full_name, job_title: job_title ?? null, updated_at: new Date() },
        });
    },
  };
}

export const workerProjectionCreated = projectWorker(PEOPLE_WORKER_CREATED);
export const workerProjectionUpdated = projectWorker(PEOPLE_WORKER_UPDATED);
