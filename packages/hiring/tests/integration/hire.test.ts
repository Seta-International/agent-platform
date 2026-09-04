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

  it('hires an active candidate without creating an employee record in People (FUT-928 AC1, AC2, AC3)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'Senior Frontend Engineer',
          role_title: 'Frontend Lead',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const { application_id, candidate_id } = await addCandidate({
          requisition_id,
          name: 'Nguyen Huynh Son',
          seniority: 'senior',
          session: t.adminSession,
        });

        const r = await hireApplication({
          application_id,
          expected_version: 1,
          session: t.adminSession,
        });
        expect(r.version).toBe(2);

        // AC1: candidate status is updated to hired, no person_id is linked to external candidate
        const appRes = await pool.query(
          `SELECT status, stage, person_id, closed_at FROM hiring.application WHERE id = $1`,
          [application_id],
        );
        expect(appRes.rows[0]?.status).toBe('hired');
        expect(appRes.rows[0]?.stage).toBe('offer');
        expect(appRes.rows[0]?.person_id).toBeNull();
        expect(appRes.rows[0]?.closed_at).not.toBeNull();

        // AC1: No Employee record is created in People (people.person and people.employment_period)
        const peopleRes = await pool.query(
          `SELECT count(*)::int as count FROM people.person WHERE tenant_id = $1`,
          [t.tenant_id],
        );
        expect(peopleRes.rows[0]?.count).toBe(0);

        const periodRes = await pool.query(
          `SELECT count(*)::int as count FROM people.employment_period WHERE tenant_id = $1`,
          [t.tenant_id],
        );
        expect(periodRes.rows[0]?.count).toBe(0);

        // AC2: Candidate event and domain event emitted for IT Portal processing
        expect(await countEvents(pool, t.tenant_id, 'hiring.application.hired')).toBe(1);

        const ev = await pool.query(
          `SELECT kind, detail FROM hiring.candidate_event WHERE candidate_id = $1 AND kind = 'hired'`,
          [candidate_id],
        );
        expect(ev.rows).toHaveLength(1);

        // AC3: Opening is filled and Requisition headcount fulfillment logic remains functional
        const openingRes = await pool.query(
          `SELECT status, hired_application_id FROM hiring.opening WHERE requisition_id = $1`,
          [requisition_id],
        );
        expect(openingRes.rows[0]?.status).toBe('filled');
        expect(openingRes.rows[0]?.hired_application_id).toBe(application_id);

        const reqRes = await pool.query(`SELECT status FROM hiring.requisition WHERE id = $1`, [
          requisition_id,
        ]);
        expect(reqRes.rows[0]?.status).toBe('filled');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
