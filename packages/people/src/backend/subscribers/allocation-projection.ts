import type {
  AllocationCreatedPayload,
  AllocationRemovedPayload,
  AllocationUpdatedPayload,
} from '@seta/pm/events';
import {
  PM_ALLOCATION_CREATED,
  PM_ALLOCATION_REMOVED,
  PM_ALLOCATION_UPDATED,
} from '@seta/pm/events';
import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { workerAllocationProjection } from '../db/schema.ts';

// Both PM_ALLOCATION_CREATED and PM_ALLOCATION_UPDATED carry the full effective
// state of the allocation, so they map to the same projection row shape.
function toProjectionValues(p: AllocationCreatedPayload | AllocationUpdatedPayload): {
  allocation_id: string;
  tenant_id: string;
  person_id: string | null;
  project_id: string;
  account_id: string;
  lead_person_id: string | null;
  date_from: string | null;
  date_to: string | null;
  planned_pct: string | null;
  bucket: string | null;
  active: boolean;
} {
  const workerId = 'worker_id' in p ? p.worker_id : null;
  return {
    allocation_id: p.allocation_id,
    tenant_id: p.tenant_id,
    person_id: workerId ?? null,
    project_id: p.project_id,
    account_id: p.account_id,
    lead_person_id: 'lead_worker_id' in p ? (p.lead_worker_id ?? null) : null,
    date_from: p.date_from ?? null,
    date_to: p.date_to ?? null,
    planned_pct: p.planned_pct == null ? null : p.planned_pct.toString(),
    bucket: p.bucket ?? null,
    active: true,
  };
}

async function upsertAllocationProjection(
  event: DomainEvent<AllocationCreatedPayload | AllocationUpdatedPayload>,
  ctx: SubscriberCtx,
): Promise<void> {
  const row = toProjectionValues(event.payload);
  await ctx.tx
    .insert(workerAllocationProjection)
    .values(row)
    .onConflictDoUpdate({
      target: workerAllocationProjection.allocation_id,
      set: {
        person_id: row.person_id,
        project_id: row.project_id,
        account_id: row.account_id,
        lead_person_id: row.lead_person_id,
        date_from: row.date_from,
        date_to: row.date_to,
        planned_pct: row.planned_pct,
        bucket: row.bucket,
        active: true,
        updated_at: new Date(),
      },
    });
}

export const allocationProjectionCreated: SubscriberDef = {
  subscription: 'people.allocation-projection.created',
  event: PM_ALLOCATION_CREATED,
  eventVersion: 1,
  handler: (event, ctx) =>
    upsertAllocationProjection(event as DomainEvent<AllocationCreatedPayload>, ctx),
};

export const allocationProjectionUpdated: SubscriberDef = {
  subscription: 'people.allocation-projection.updated',
  event: PM_ALLOCATION_UPDATED,
  eventVersion: 1,
  handler: (event, ctx) =>
    upsertAllocationProjection(event as DomainEvent<AllocationUpdatedPayload>, ctx),
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
