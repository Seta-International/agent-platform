import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import { addCandidate, moveApplicationStage, openRequisition } from '../../src/index.ts';
import { countEvents, inScope, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('moveApplicationStage', () => {
  it('advances an active application and blocks moves once terminal', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await inScope(t.adminSession, () =>
          openRequisition({
            title: 'R',
            kind: 'new',
            headcount: 1,
            session: t.adminSession,
          }),
        );
        const { application_id } = await inScope(t.adminSession, () =>
          addCandidate({
            requisition_id,
            name: 'C',
            session: t.adminSession,
          }),
        );

        const r = await inScope(t.adminSession, () =>
          moveApplicationStage({
            application_id,
            expected_version: 1,
            to: 'screening',
            session: t.adminSession,
          }),
        );
        expect(r.version).toBe(2);
        expect(await countEvents(pool, t.tenant_id, 'hiring.application.stage_changed')).toBe(1);

        await expect(
          inScope(t.adminSession, () =>
            moveApplicationStage({
              application_id,
              expected_version: 99,
              to: 'interview',
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow(/version/i);

        // Set status to rejected directly in DB to test terminal-status guard (rejectApplication is Task 9)
        await pool.query(
          `UPDATE hiring.application SET status = 'rejected', version = 3 WHERE id = $1`,
          [application_id],
        );
        await expect(
          inScope(t.adminSession, () =>
            moveApplicationStage({
              application_id,
              expected_version: 3,
              to: 'offer',
              session: t.adminSession,
            }),
          ),
        ).rejects.toThrow(/active/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
