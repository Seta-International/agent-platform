import {
  PEOPLE_WORKER_CREATED,
  PEOPLE_WORKER_UPDATED,
  type WorkerCreatedPayload,
  type WorkerUpdatedPayload,
} from '@seta/people/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { workerProjection } from '../db/schema.ts';

export const workerProjectionCreated: SubscriberDef = {
  subscription: 'pm.worker-projection.created',
  event: PEOPLE_WORKER_CREATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<WorkerCreatedPayload>;
    const { worker_id, tenant_id, full_name, job_title } = e.payload;

    await ctx.tx
      .insert(workerProjection)
      .values({ worker_id, tenant_id, full_name, job_title: job_title ?? null })
      .onConflictDoUpdate({
        target: workerProjection.worker_id,
        set: { tenant_id, full_name, job_title: job_title ?? null, updated_at: new Date() },
      });
  },
};

export const workerProjectionUpdated: SubscriberDef = {
  subscription: 'pm.worker-projection.updated',
  event: PEOPLE_WORKER_UPDATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<WorkerUpdatedPayload>;
    const { worker_id, tenant_id, full_name, job_title } = e.payload;

    await ctx.tx
      .insert(workerProjection)
      .values({ worker_id, tenant_id, full_name, job_title: job_title ?? null })
      .onConflictDoUpdate({
        target: workerProjection.worker_id,
        set: { tenant_id, full_name, job_title: job_title ?? null, updated_at: new Date() },
      });
  },
};
