import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { editProject, submitCharter } from '../../src/index.ts';
import { approveCharterTwoStage, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('project created/updated events carry the End Date (FUT-984)', () => {
  it('pm.project.created and pm.project.updated payloads include the project date_to', async () => {
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

        const { project_id: charterId } = await submitCharter({
          account_id: acc.rows[0].id,
          name: 'P',
          pm_worker_id: t.adminSession.user_id,
          methodology: 'scrum',
          pricing_model: 'fixed_price',
          budget_bmm: 100,
          date_to: '2026-12-31',
          session: t.adminSession,
        });
        const { project_id } = await approveCharterTwoStage(charterId, t.tenant_id);

        const createdEvents = await readEvents(pool, t.tenant_id, 'pm.project.created');
        expect(createdEvents).toHaveLength(1);
        expect(createdEvents[0]!.payload.date_to).toBe('2026-12-31');

        // date_to itself isn't editable via editProject's patch (set once at charter
        // submission) — an unrelated field change still must carry the current date_to.
        await editProject({
          project_id,
          patch: { objective: 'Updated objective' },
          session: t.adminSession,
        });

        const updatedEvents = await readEvents(pool, t.tenant_id, 'pm.project.updated');
        expect(updatedEvents).toHaveLength(1);
        expect(updatedEvents[0]!.payload.date_to).toBe('2026-12-31');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
