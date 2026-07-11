import type { AllocationCreatedPayload, AllocationRemovedPayload } from '@seta/pm/events';
import { PM_ALLOCATION_CREATED, PM_ALLOCATION_REMOVED } from '@seta/pm/events';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { workerAllocationProjection } from '../db/schema.ts';

export const allocationProjectionCreated: SubscriberDef = {
  subscription: 'people.allocation-projection.created',
  event: PM_ALLOCATION_CREATED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<AllocationCreatedPayload>;
    const {
      allocation_id,
      tenant_id,
      worker_id,
      project_id,
      account_id,
      lead_worker_id,
      date_from,
      date_to,
      planned_pct,
      bucket,
    } = e.payload;

    await ctx.tx
      .insert(workerAllocationProjection)
      .values({
        allocation_id,
        tenant_id,
        person_id: worker_id ?? null,
        project_id,
        account_id,
        lead_person_id: lead_worker_id ?? null,
        date_from: date_from ?? null,
        date_to: date_to ?? null,
        planned_pct: planned_pct == null ? null : planned_pct.toString(),
        bucket: bucket ?? null,
        active: true,
      })
      .onConflictDoUpdate({
        target: workerAllocationProjection.allocation_id,
        set: {
          person_id: worker_id ?? null,
          project_id,
          account_id,
          lead_person_id: lead_worker_id ?? null,
          date_from: date_from ?? null,
          date_to: date_to ?? null,
          planned_pct: planned_pct == null ? null : planned_pct.toString(),
          bucket: bucket ?? null,
          active: true,
          updated_at: new Date(),
        },
      });
  },
};

export const allocationProjectionRemoved: SubscriberDef = {
  subscription: 'people.allocation-projection.removed',
  event: PM_ALLOCATION_REMOVED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<AllocationRemovedPayload>;
    const { allocation_id, tenant_id } = e.payload;

    await ctx.tx
      .delete(workerAllocationProjection)
      .where(
        and(
          eq(workerAllocationProjection.allocation_id, allocation_id),
          eq(workerAllocationProjection.tenant_id, tenant_id),
        ),
      );
  },
};
