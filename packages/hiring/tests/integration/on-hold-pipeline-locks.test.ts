import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import {
  addCandidate,
  hireApplication,
  holdRequisition,
  moveApplicationStage,
  openRequisition,
  rejectApplication,
  resumeRequisition,
  setApplicationRating,
  transferApplication,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('on-hold requisitions freeze their pipeline (FUT-559)', () => {
  it('blocks in-pipeline mutations while held, and transfers never target a held role', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        const held = await openRequisition({
          title: 'Held role',
          kind: 'new',
          headcount: 1,
          session,
        });
        const other = await openRequisition({
          title: 'Other role',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id } = await addCandidate({
          requisition_id: held.requisition_id,
          name: 'Paula Paused',
          session,
        });
        const outsider = await addCandidate({
          requisition_id: other.requisition_id,
          name: 'Oscar Outside',
          session,
        });
        const { version: heldVersion } = await holdRequisition({
          requisition_id: held.requisition_id,
          session,
        });

        // Progression within the held requisition's pipeline is frozen.
        await expect(
          moveApplicationStage({ application_id, expected_version: 1, to: 'screening', session }),
        ).rejects.toThrow(/on hold/i);
        await expect(
          hireApplication({ application_id, expected_version: 1, session }),
        ).rejects.toThrow(/on hold/i);
        await expect(
          setApplicationRating({ application_id, expected_version: 1, rating: 4, session }),
        ).rejects.toThrow(/on hold/i);
        await expect(
          rejectApplication({
            application_id,
            expected_version: 1,
            input: { reason: 'Not a fit', reason_id: crypto.randomUUID(), tags: [] },
            session,
          }),
        ).rejects.toThrow(/on hold/i);

        // A held requisition is not a valid transfer destination either.
        await expect(
          transferApplication({
            application_id: outsider.application_id,
            expected_version: 1,
            input: { target_requisition_id: held.requisition_id },
            session,
          }),
        ).rejects.toThrow(/not open/i);

        // Resume unfreezes the pipeline.
        await resumeRequisition({
          requisition_id: held.requisition_id,
          expected_version: heldVersion,
          session,
        });
        const moved = await moveApplicationStage({
          application_id,
          expected_version: 1,
          to: 'screening',
          session,
        });
        expect(moved.version).toBe(2);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('FUT-773: moves a candidate out of a held requisition to an open one', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const session = t.adminSession;
        // Source requisition must be open to receive the candidate, then it goes on hold.
        const source = await openRequisition({
          title: 'Paused role',
          kind: 'new',
          headcount: 1,
          session,
        });
        const target = await openRequisition({
          title: 'Active role',
          kind: 'new',
          headcount: 1,
          session,
        });
        const { application_id } = await addCandidate({
          requisition_id: source.requisition_id,
          name: 'Movable Mia',
          session,
        });
        await holdRequisition({ requisition_id: source.requisition_id, session });

        // The candidate can still be moved out of the held role to an open one.
        const res = await transferApplication({
          application_id,
          expected_version: 1,
          input: { target_requisition_id: target.requisition_id },
          session,
        });
        expect(res.to_application_id).toBeTruthy();
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
