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

describe('auto-filling a requisition when its last opening is hired (FUT-769)', () => {
  it('flips the requisition to filled and closes remaining active applications when the last opening is hired', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'One-seat role',
          kind: 'new',
          headcount: 1,
          session,
        });
        const hired = await addCandidate({ requisition_id, name: 'Hera Hired', session });
        const other = await addCandidate({ requisition_id, name: 'Ollie Other', session });

        await hireApplication({
          application_id: hired.application_id,
          expected_version: 1,
          session,
        });

        // The requisition auto-closes as filled — its single opening was the last one, so hiring
        // fully staffs it. No manual "Mark filled" needed.
        const req = await pool.query(
          `SELECT status, closed_at FROM hiring.requisition WHERE id = $1`,
          [requisition_id],
        );
        expect(req.rows[0].status).toBe('filled');
        expect(req.rows[0].closed_at).not.toBeNull();

        // The opening the hire filled stays filled; there are no open openings left.
        const openings = await pool.query(
          `SELECT status FROM hiring.opening WHERE requisition_id = $1`,
          [requisition_id],
        );
        expect(openings.rows.every((o) => o.status === 'filled')).toBe(true);

        // Other still-active applications are closed (position filled); the hired one stays hired.
        const apps = await pool.query(
          `SELECT id, status FROM hiring.application WHERE requisition_id = $1`,
          [requisition_id],
        );
        const byId = new Map(apps.rows.map((r) => [r.id, r.status]));
        expect(byId.get(hired.application_id)).toBe('hired');
        expect(byId.get(other.application_id)).toBe('cancelled');

        // The close emits the same requisition-closed event as pressing Mark filled.
        expect(await countEvents(pool, t.tenant_id, 'hiring.requisition.closed')).toBe(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('keeps the requisition open when a hire leaves other openings vacant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const { requisition_id } = await openRequisition({
          title: 'Two-seat role',
          kind: 'new',
          headcount: 2,
          session,
        });
        const hired = await addCandidate({ requisition_id, name: 'Hera Hired', session });
        const stillGoing = await addCandidate({ requisition_id, name: 'Sam Screening', session });

        await hireApplication({
          application_id: hired.application_id,
          expected_version: 1,
          session,
        });

        // One of two openings filled — the requisition is still hiring, so it stays open and the
        // second candidate stays active.
        const req = await pool.query(`SELECT status FROM hiring.requisition WHERE id = $1`, [
          requisition_id,
        ]);
        expect(req.rows[0].status).toBe('open');

        const apps = await pool.query(`SELECT status FROM hiring.application WHERE id = $1`, [
          stillGoing.application_id,
        ]);
        expect(apps.rows[0].status).toBe('active');
        expect(await countEvents(pool, t.tenant_id, 'hiring.requisition.closed')).toBe(0);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
