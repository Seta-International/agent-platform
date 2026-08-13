import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import { addCandidate, hireApplication, openRequisition } from '../../src/index.ts';
import { countEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('hireApplication', () => {
  it('hires an active application once, records the timeline event, and blocks re-hiring', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'R',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { application_id, candidate_id } = await addCandidate({
          requisition_id,
          name: 'C',
          session: t.adminSession,
        });

        await expect(
          hireApplication({ application_id, expected_version: 99, session: t.adminSession }),
        ).rejects.toThrow(/version/i);

        const r = await hireApplication({
          application_id,
          expected_version: 1,
          session: t.adminSession,
        });
        expect(r.version).toBe(2);

        const { rows } = await pool.query(
          `SELECT status, stage, closed_at FROM hiring.application WHERE id = $1`,
          [application_id],
        );
        expect(rows[0].status).toBe('hired');
        expect(rows[0].stage).toBe('offer');
        expect(rows[0].closed_at).not.toBeNull();
        expect(await countEvents(pool, t.tenant_id, 'hiring.application.hired')).toBe(1);

        const ev = await pool.query(
          `SELECT kind FROM hiring.candidate_event WHERE candidate_id = $1 AND kind = 'hired'`,
          [candidate_id],
        );
        expect(ev.rows).toHaveLength(1);

        // Terminal now — hiring again (or any further move) is refused.
        await expect(
          hireApplication({ application_id, expected_version: 2, session: t.adminSession }),
        ).rejects.toThrow(/active/i);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
