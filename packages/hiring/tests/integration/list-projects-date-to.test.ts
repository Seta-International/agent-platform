import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { projectProjection } from '../../src/backend/db/schema.ts';
import { listProjects } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('listProjects exposes the project End Date (FUT-984)', () => {
  it('returns date_to alongside each project so the picker can grey out an ended one', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const account_id = crypto.randomUUID();
        const project_id = crypto.randomUUID();
        await hiringDb().insert(projectProjection).values({
          project_id,
          tenant_id: t.tenant_id,
          account_id,
          name: 'Ended Co',
          date_to: '2020-01-01',
        });

        const projects = await listProjects(t.adminSession, account_id);
        expect(projects).toEqual([
          { project_id, account_id, name: 'Ended Co', date_to: '2020-01-01' },
        ]);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
