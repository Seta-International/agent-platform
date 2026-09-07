import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { projectProjection } from '../../src/backend/db/schema.ts';
import { openRequisition } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  tenantId: string,
  dateTo: string | null,
): Promise<{ account_id: string; project_id: string }> {
  const account_id = crypto.randomUUID();
  const project_id = crypto.randomUUID();
  await hiringDb().insert(projectProjection).values({
    project_id,
    tenant_id: tenantId,
    account_id,
    name: 'Ended Co',
    date_to: dateTo,
  });
  return { account_id, project_id };
}

describe('openRequisition vs. project End Date (FUT-984 AC1)', () => {
  it('rejects opening a requisition against a project whose End Date has already passed', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(t.tenant_id, '2020-01-01');

        await expect(
          openRequisition({
            title: 'Senior Backend Engineer',
            kind: 'new',
            project_id,
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'VALIDATION' });
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows opening a requisition against a project whose End Date is in the future', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(t.tenant_id, '2099-01-01');

        const { requisition_id } = await openRequisition({
          title: 'Senior Backend Engineer',
          kind: 'new',
          project_id,
          session: t.adminSession,
        });
        expect(requisition_id).toBeTruthy();
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('allows opening a requisition against a project with no End Date', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(t.tenant_id, null);

        const { requisition_id } = await openRequisition({
          title: 'Senior Backend Engineer',
          kind: 'new',
          project_id,
          session: t.adminSession,
        });
        expect(requisition_id).toBeTruthy();
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
