import { resetCoreDb } from '@seta/core/testing';
import type { ProjectCreatedPayload, ProjectUpdatedPayload } from '@seta/pm/events';
import { PM_PROJECT_CREATED, PM_PROJECT_UPDATED } from '@seta/pm/events';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { projectProjection } from '../../src/backend/db/schema.ts';
import {
  projectProjectionCreated,
  projectProjectionUpdated,
} from '../../src/backend/subscribers/project-projection.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function createdEvent(payload: ProjectCreatedPayload): DomainEvent<ProjectCreatedPayload> {
  return {
    id: crypto.randomUUID(),
    tenantId: payload.tenant_id,
    aggregateType: 'pm.project',
    aggregateId: payload.project_id,
    eventType: PM_PROJECT_CREATED,
    eventVersion: 1,
    payload,
  } as never;
}

function updatedEvent(payload: ProjectUpdatedPayload): DomainEvent<ProjectUpdatedPayload> {
  return {
    id: crypto.randomUUID(),
    tenantId: payload.tenant_id,
    aggregateType: 'pm.project',
    aggregateId: payload.project_id,
    eventType: PM_PROJECT_UPDATED,
    eventVersion: 1,
    payload,
  } as never;
}

describe('projectProjectionCreated', () => {
  it('upserts a project_projection row with project_id, tenant_id, account_id, name', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = crypto.randomUUID();
        const accountId = crypto.randomUUID();

        const payload: ProjectCreatedPayload = {
          project_id: projectId,
          tenant_id: t.tenant_id,
          account_id: accountId,
          name: 'Alpha Project',
          charter_id: crypto.randomUUID(),
          date_to: null,
        };

        await peopleDb().transaction(async (tx) => {
          await projectProjectionCreated.handler(createdEvent(payload), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(projectProjection)
          .where(eq(projectProjection.project_id, projectId));

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          project_id: projectId,
          tenant_id: t.tenant_id,
          account_id: accountId,
          name: 'Alpha Project',
        });
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is idempotent — second call with same project_id stays 1 row with updated values', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = crypto.randomUUID();
        const accountId1 = crypto.randomUUID();
        const accountId2 = crypto.randomUUID();

        const first: ProjectCreatedPayload = {
          project_id: projectId,
          tenant_id: t.tenant_id,
          account_id: accountId1,
          name: 'Original Name',
          charter_id: crypto.randomUUID(),
          date_to: null,
        };
        const second: ProjectCreatedPayload = {
          ...first,
          account_id: accountId2,
          name: 'Updated Name',
        };

        await peopleDb().transaction(async (tx) => {
          await projectProjectionCreated.handler(createdEvent(first), { tx } as never);
        });
        await peopleDb().transaction(async (tx) => {
          await projectProjectionCreated.handler(createdEvent(second), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(projectProjection)
          .where(eq(projectProjection.project_id, projectId));

        expect(rows).toHaveLength(1);
        expect(rows[0]!.name).toBe('Updated Name');
        expect(rows[0]!.account_id).toBe(accountId2);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

describe('projectProjectionUpdated', () => {
  it('upserts new name and account_id for an existing project_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const newAccountId = crypto.randomUUID();

        await peopleDb().insert(projectProjection).values({
          project_id: projectId,
          tenant_id: t.tenant_id,
          account_id: accountId,
          name: 'Old Name',
        });

        const payload: ProjectUpdatedPayload = {
          project_id: projectId,
          tenant_id: t.tenant_id,
          account_id: newAccountId,
          name: 'New Name',
          fields: ['name', 'account_id'],
          date_to: null,
        };

        await peopleDb().transaction(async (tx) => {
          await projectProjectionUpdated.handler(updatedEvent(payload), { tx } as never);
        });

        const rows = await peopleDb()
          .select()
          .from(projectProjection)
          .where(eq(projectProjection.project_id, projectId));

        expect(rows).toHaveLength(1);
        expect(rows[0]!.name).toBe('New Name');
        expect(rows[0]!.account_id).toBe(newAccountId);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
