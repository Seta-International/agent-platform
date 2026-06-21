import { resetCoreDb } from '@seta/core/testing';
import type { AccountCreatedPayload, AccountUpdatedPayload } from '@seta/pm/events';
import { PM_ACCOUNT_CREATED, PM_ACCOUNT_UPDATED } from '@seta/pm/events';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { accountProjection, workerAllocationProjection } from '../../src/backend/db/schema.ts';
import {
  accountProjectionCreated,
  accountProjectionUpdated,
} from '../../src/backend/subscribers/account-projection.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function createdEvent(payload: AccountCreatedPayload): DomainEvent<AccountCreatedPayload> {
  return {
    id: crypto.randomUUID(),
    tenantId: payload.tenant_id,
    aggregateType: 'pm.account',
    aggregateId: payload.account_id,
    eventType: PM_ACCOUNT_CREATED,
    eventVersion: 1,
    payload,
  } as never;
}

function updatedEvent(payload: AccountUpdatedPayload): DomainEvent<AccountUpdatedPayload> {
  return {
    id: crypto.randomUUID(),
    tenantId: payload.tenant_id,
    aggregateType: 'pm.account',
    aggregateId: payload.account_id,
    eventType: PM_ACCOUNT_UPDATED,
    eventVersion: 1,
    payload,
  } as never;
}

describe('accountProjectionCreated', () => {
  it('upserts an account_projection row with name and am_worker_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = crypto.randomUUID();
        const amWorkerId = crypto.randomUUID();

        const payload: AccountCreatedPayload = {
          account_id: accountId,
          tenant_id: t.tenant_id,
          name: 'Acme Corp',
          am_worker_id: amWorkerId,
        };

        await peopleDb().transaction(async (tx) => {
          await accountProjectionCreated.handler(createdEvent(payload), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(accountProjection)
          .where(eq(accountProjection.account_id, accountId));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          account_id: accountId,
          tenant_id: t.tenant_id,
          name: 'Acme Corp',
          am_worker_id: amWorkerId,
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('upserts with am_worker_id null', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = crypto.randomUUID();

        const payload: AccountCreatedPayload = {
          account_id: accountId,
          tenant_id: t.tenant_id,
          name: 'No AM Corp',
          am_worker_id: null,
        };

        await peopleDb().transaction(async (tx) => {
          await accountProjectionCreated.handler(createdEvent(payload), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(accountProjection)
          .where(eq(accountProjection.account_id, accountId));

        expect(rows).toHaveLength(1);
        expect(rows[0]!.am_worker_id).toBeNull();
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is idempotent — second call with same account_id updates values, stays 1 row', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = crypto.randomUUID();

        const first: AccountCreatedPayload = {
          account_id: accountId,
          tenant_id: t.tenant_id,
          name: 'Original Name',
          am_worker_id: null,
        };
        const second: AccountCreatedPayload = {
          ...first,
          name: 'Updated Name',
          am_worker_id: crypto.randomUUID(),
        };

        await peopleDb().transaction(async (tx) => {
          await accountProjectionCreated.handler(createdEvent(first), { tx } as never);
        });
        await peopleDb().transaction(async (tx) => {
          await accountProjectionCreated.handler(createdEvent(second), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(accountProjection)
          .where(eq(accountProjection.account_id, accountId));

        expect(rows).toHaveLength(1);
        expect(rows[0]!.name).toBe('Updated Name');
        expect(rows[0]!.am_worker_id).toBe(second.am_worker_id);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('accountProjectionUpdated', () => {
  it('upserts account_projection AND cascades account_name to worker_allocation_projection', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = crypto.randomUUID();
        const allocationId = crypto.randomUUID();
        const projectId = crypto.randomUUID();

        // Seed an existing account_projection row
        await peopleDb().insert(accountProjection).values({
          account_id: accountId,
          tenant_id: t.tenant_id,
          name: 'Old Name',
          am_worker_id: null,
        });

        // Seed an allocation row with the old account_name
        await peopleDb().insert(workerAllocationProjection).values({
          allocation_id: allocationId,
          tenant_id: t.tenant_id,
          worker_id: null,
          project_id: projectId,
          account_id: accountId,
          account_name: 'Old Name',
          lead_worker_id: null,
          active: true,
        });

        const payload: AccountUpdatedPayload = {
          account_id: accountId,
          tenant_id: t.tenant_id,
          name: 'New Name',
          am_worker_id: null,
          fields: ['name'],
        };

        await peopleDb().transaction(async (tx) => {
          await accountProjectionUpdated.handler(updatedEvent(payload), { tx } as never);
        });

        const acctRows = await peopleDb()
          .select()
          .from(accountProjection)
          .where(eq(accountProjection.account_id, accountId));

        expect(acctRows).toHaveLength(1);
        expect(acctRows[0]!.name).toBe('New Name');

        const allocRows = await peopleDb()
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, allocationId));

        expect(allocRows).toHaveLength(1);
        expect(allocRows[0]!.account_name).toBe('New Name');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('cascade only touches rows for that account_id — other accounts unchanged', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = crypto.randomUUID();
        const otherAccountId = crypto.randomUUID();
        const allocationId = crypto.randomUUID();
        const otherAllocationId = crypto.randomUUID();
        const projectId = crypto.randomUUID();

        // Seed both allocation rows
        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            {
              allocation_id: allocationId,
              tenant_id: t.tenant_id,
              worker_id: null,
              project_id: projectId,
              account_id: accountId,
              account_name: 'Old Name',
              lead_worker_id: null,
              active: true,
            },
            {
              allocation_id: otherAllocationId,
              tenant_id: t.tenant_id,
              worker_id: null,
              project_id: projectId,
              account_id: otherAccountId,
              account_name: 'Other Account Name',
              lead_worker_id: null,
              active: true,
            },
          ]);

        const payload: AccountUpdatedPayload = {
          account_id: accountId,
          tenant_id: t.tenant_id,
          name: 'New Name',
          am_worker_id: null,
          fields: ['name'],
        };

        await peopleDb().transaction(async (tx) => {
          await accountProjectionUpdated.handler(updatedEvent(payload), { tx } as never);
        });

        const otherRows = await peopleDb()
          .select()
          .from(workerAllocationProjection)
          .where(
            and(
              eq(workerAllocationProjection.allocation_id, otherAllocationId),
              eq(workerAllocationProjection.tenant_id, t.tenant_id),
            ),
          );

        expect(otherRows).toHaveLength(1);
        expect(otherRows[0]!.account_name).toBe('Other Account Name');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
