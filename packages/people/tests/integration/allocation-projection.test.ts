import { resetCoreDb } from '@seta/core/testing';
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
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { workerAllocationProjection } from '../../src/backend/db/schema.ts';
import {
  allocationProjectionCreated,
  allocationProjectionRemoved,
  allocationProjectionUpdated,
} from '../../src/backend/subscribers/allocation-projection.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function createdEvent(payload: AllocationCreatedPayload): DomainEvent<AllocationCreatedPayload> {
  return {
    id: crypto.randomUUID(),
    tenantId: payload.tenant_id,
    aggregateType: 'pm.allocation',
    aggregateId: payload.allocation_id,
    eventType: PM_ALLOCATION_CREATED,
    eventVersion: 1,
    payload,
  } as never;
}

function removedEvent(payload: AllocationRemovedPayload): DomainEvent<AllocationRemovedPayload> {
  return {
    id: crypto.randomUUID(),
    tenantId: payload.tenant_id,
    aggregateType: 'pm.allocation',
    aggregateId: payload.allocation_id,
    eventType: PM_ALLOCATION_REMOVED,
    eventVersion: 1,
    payload,
  } as never;
}

function updatedEvent(payload: AllocationUpdatedPayload): DomainEvent<AllocationUpdatedPayload> {
  return {
    id: crypto.randomUUID(),
    tenantId: payload.tenant_id,
    aggregateType: 'pm.allocation',
    aggregateId: payload.allocation_id,
    eventType: PM_ALLOCATION_UPDATED,
    eventVersion: 1,
    payload,
  } as never;
}

describe('allocationProjectionCreated', () => {
  it('inserts a projection row with all fields and active=true', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const allocationId = crypto.randomUUID();
        const workerId = crypto.randomUUID();
        const projectId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const leadWorkerId = crypto.randomUUID();

        const payload: AllocationCreatedPayload = {
          allocation_id: allocationId,
          tenant_id: t.tenant_id,
          worker_id: workerId,
          project_id: projectId,
          account_id: accountId,
          account_name: 'Acme Corp',
          lead_worker_id: leadWorkerId,
          date_from: '2026-03-01',
          date_to: '2026-09-30',
          planned_pct: 60,
          bucket: 'internal',
        };

        await peopleDb().transaction(async (tx) => {
          await allocationProjectionCreated.handler(createdEvent(payload), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, allocationId));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          allocation_id: allocationId,
          tenant_id: t.tenant_id,
          person_id: workerId,
          project_id: projectId,
          account_id: accountId,
          lead_person_id: leadWorkerId,
          active: true,
          date_from: '2026-03-01',
          date_to: '2026-09-30',
          planned_pct: '60.0000', // numeric(10,4) → string in drizzle
          bucket: 'internal',
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('upserts on duplicate allocation_id (idempotent — second call wins)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const allocationId = crypto.randomUUID();
        const projectId = crypto.randomUUID();
        const accountId = crypto.randomUUID();

        const first: AllocationCreatedPayload = {
          allocation_id: allocationId,
          tenant_id: t.tenant_id,
          worker_id: crypto.randomUUID(),
          project_id: projectId,
          account_id: accountId,
          account_name: 'Original Name',
          lead_worker_id: null,
          date_from: null,
          date_to: null,
          planned_pct: null,
          bucket: 'billable',
        };
        const second: AllocationCreatedPayload = {
          ...first,
          bucket: 'internal',
        };

        await peopleDb().transaction(async (tx) => {
          await allocationProjectionCreated.handler(createdEvent(first), { tx } as never);
        });
        await peopleDb().transaction(async (tx) => {
          await allocationProjectionCreated.handler(createdEvent(second), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, allocationId));

        expect(rows).toHaveLength(1);
        expect(rows[0]!.bucket).toBe('internal');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('allocationProjectionRemoved', () => {
  it('deletes the projection row by allocation_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const allocationId = crypto.randomUUID();
        const projectId = crypto.randomUUID();
        const accountId = crypto.randomUUID();

        const created: AllocationCreatedPayload = {
          allocation_id: allocationId,
          tenant_id: t.tenant_id,
          worker_id: null,
          project_id: projectId,
          account_id: accountId,
          account_name: 'To Delete',
          lead_worker_id: null,
          date_from: null,
          date_to: null,
          planned_pct: null,
          bucket: 'billable',
        };

        await peopleDb().transaction(async (tx) => {
          await allocationProjectionCreated.handler(createdEvent(created), { tx } as never);
        });

        const removed: AllocationRemovedPayload = {
          allocation_id: allocationId,
          tenant_id: t.tenant_id,
          worker_id: null,
          project_id: projectId,
          account_id: accountId,
        };

        await peopleDb().transaction(async (tx) => {
          await allocationProjectionRemoved.handler(removedEvent(removed), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, allocationId));

        expect(rows).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is a safe no-op when allocation_id does not exist', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const payload: AllocationRemovedPayload = {
          allocation_id: crypto.randomUUID(),
          tenant_id: t.tenant_id,
          worker_id: null,
          project_id: crypto.randomUUID(),
          account_id: crypto.randomUUID(),
        };

        await expect(
          peopleDb().transaction(async (tx) => {
            await allocationProjectionRemoved.handler(removedEvent(payload), { tx } as never);
          }),
        ).resolves.not.toThrow();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

// FUT-739: after a PM edits an allocation (end date / planned_pct), the People
// Resource Allocation grid kept showing the OLD timeline. Root cause: no
// subscriber handles PM_ALLOCATION_UPDATED, so the projection row that the grid
// reads is never refreshed. This describe is RED on main and turns GREEN once
// allocationProjectionUpdated is implemented.
describe('allocationProjectionUpdated', () => {
  it('syncs planned_pct / date range / bucket when PM emits PM_ALLOCATION_UPDATED', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const allocationId = crypto.randomUUID();
        const workerId = crypto.randomUUID();
        const projectId = crypto.randomUUID();
        const accountId = crypto.randomUUID();

        // Seed the projection the way PM_ALLOCATION_CREATED would have.
        const created: AllocationCreatedPayload = {
          allocation_id: allocationId,
          tenant_id: t.tenant_id,
          worker_id: workerId,
          project_id: projectId,
          account_id: accountId,
          account_name: 'Acme Corp',
          lead_worker_id: null,
          date_from: '2026-01-01',
          date_to: '2026-12-31',
          planned_pct: 60,
          bucket: 'billable',
        };
        await peopleDb().transaction(async (tx) => {
          await allocationProjectionCreated.handler(createdEvent(created), { tx } as never);
        });

        // A PM edits the allocation: end date pulled in to 2026-07-31, pct 60->30.
        const updated: AllocationUpdatedPayload = {
          allocation_id: allocationId,
          project_id: projectId,
          worker_id: workerId,
          account_id: accountId,
          tenant_id: t.tenant_id,
          planned_pct: 30,
          lead_worker_id: null,
          date_from: '2026-01-01',
          date_to: '2026-07-31',
          bucket: 'billable',
          fields: ['planned_pct', 'date_to'],
        };
        await peopleDb().transaction(async (tx) => {
          await allocationProjectionUpdated.handler(updatedEvent(updated), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, allocationId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          planned_pct: '30.0000',
          date_from: '2026-01-01',
          date_to: '2026-07-31',
          bucket: 'billable',
          active: true,
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
