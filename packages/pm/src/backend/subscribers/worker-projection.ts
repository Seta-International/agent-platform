import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { personProjection } from '../db/schema.ts';

// Local event contract — no import from @seta/people to preserve the module boundary
// (People already depends on @seta/pm; importing back would create a package cycle).
export const PEOPLE_WORKER_CREATED = 'people.worker.created';
export const PEOPLE_WORKER_UPDATED = 'people.worker.updated';
export const PEOPLE_WORKER_TERMINATED = 'people.worker.terminated';
export const PEOPLE_WORKER_REINSTATED = 'people.worker.reinstated';

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

export interface PeopleWorkerLifecycle {
  worker_id: string;
  person_id: string;
  tenant_id: string;
}

// FUT-953: terminate/reinstate only ever fire for a worker that already exists, and
// per-aggregate event ordering guarantees its `created` projection row landed first — a
// plain UPDATE that matches zero rows is a safe no-op, unlike an upsert which would risk
// fabricating a row with a placeholder full_name.
function projectAlumniFlag(eventType: string, isAlumni: boolean): SubscriberDef {
  return {
    subscription: `pm.worker-projection.${isAlumni ? 'terminated' : 'reinstated'}`,
    event: eventType,
    eventVersion: 1,
    handler: async (event, ctx) => {
      const { worker_id, tenant_id } = (event as DomainEvent<PeopleWorkerLifecycle>).payload;
      await ctx.tx
        .update(personProjection)
        .set({ is_alumni: isAlumni, updated_at: new Date() })
        .where(
          and(eq(personProjection.person_id, worker_id), eq(personProjection.tenant_id, tenant_id)),
        );
    },
  };
}

export const workerProjectionTerminated = projectAlumniFlag(PEOPLE_WORKER_TERMINATED, true);
export const workerProjectionReinstated = projectAlumniFlag(PEOPLE_WORKER_REINSTATED, false);
