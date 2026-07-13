// packages/pm/tests/integration/project-status-filter.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { createAllocation, getProject, listProjects, submitCharter } from '../../src/index.ts';
import { approveCharterTwoStage, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('pre-active projects are excluded from live-project readers', () => {
  it('listProjects/getProject/createAllocation exclude a submitted (not-yet-approved) project', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const accountId = acc.rows[0].id;

        // Submitted, left un-approved.
        const { project_id: submittedId } = await submitCharter({
          account_id: accountId,
          name: 'Pending Charter',
          methodology: 'scrum',
          pricing_model: 'fixed_price',
          budget_bmm: 100,
          team_size: 4,
          pm_worker_id: t.adminSession.user_id,
          session: t.adminSession,
        });

        // Driven to active via the full two-stage approve flow.
        const { project_id: activeId } = await submitCharter({
          account_id: accountId,
          name: 'Approved Charter',
          methodology: 'scrum',
          pricing_model: 'fixed_price',
          budget_bmm: 100,
          team_size: 4,
          pm_worker_id: t.adminSession.user_id,
          session: t.adminSession,
        });
        await approveCharterTwoStage(activeId, t.tenant_id);

        const listed = await listProjects(t.adminSession);
        const listedIds = listed.map((p) => p.project_id);
        expect(listedIds).toContain(activeId);
        expect(listedIds).not.toContain(submittedId);

        await expect(
          getProject({ project_id: submittedId, session: t.adminSession }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(
          getProject({ project_id: activeId, session: t.adminSession }),
        ).resolves.toMatchObject({ project_id: activeId });

        await expect(
          createAllocation({
            project_id: submittedId,
            bucket: 'billable',
            status: 'placeholder',
            session: t.adminSession,
          }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
