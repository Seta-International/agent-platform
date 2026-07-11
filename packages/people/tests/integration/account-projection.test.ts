import { resetCoreDb } from '@seta/core/testing';
import type { AccountCreatedPayload, AccountUpdatedPayload } from '@seta/pm/events';
import { PM_ACCOUNT_CREATED, PM_ACCOUNT_UPDATED } from '@seta/pm/events';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { accountProjection } from '../../src/backend/db/schema.ts';
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
  it('upserts an account_projection row with name (am ownership is not projected)', async () => {
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
          name: 'Acme Corp',
          am_worker_id: crypto.randomUUID(),
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
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('upserts a row when the event carries am_worker_id null', async () => {
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
        expect(rows[0]!.name).toBe('No AM Corp');
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
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('accountProjectionUpdated', () => {
  it('upserts the account_projection name (allocation rows read the name via join, not a cascade)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = crypto.randomUUID();

        // Seed an existing account_projection row
        await peopleDb().insert(accountProjection).values({
          account_id: accountId,
          tenant_id: t.tenant_id,
          name: 'Old Name',
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
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
