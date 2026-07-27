import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import {
  addCandidate,
  applyInternalRequisition,
  createRejectionReason,
  getCandidate,
  moveApplicationStage,
  openRequisition,
  rejectApplication,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

// FUT-761: a user who applies internally becomes a candidate; the recruiter actions that same
// user later performs on OTHER candidates/requisitions must NOT leak into their own timeline.
describe('candidate timeline scope (FUT-761)', () => {
  it('does not include events from other candidates acted on by the same user', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        // Step 2: admin applies for a requisition and becomes a candidate.
        const { requisition_id: ownReq } = await openRequisition({
          title: 'My Internal Role',
          kind: 'new',
          session: t.adminSession,
        });
        const self = await applyInternalRequisition({
          requisition_id: ownReq,
          session: t.adminSession,
        });

        // Step 3: same admin performs hiring actions on ANOTHER candidate/requisition.
        const { requisition_id: otherReq } = await openRequisition({
          title: 'Some Other Role',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const other = await addCandidate({
          requisition_id: otherReq,
          name: 'Bob External',
          personal_email: 'bob.external@example.test',
          session: t.adminSession,
        });
        await moveApplicationStage({
          application_id: other.application_id,
          to: 'screening',
          session: t.adminSession,
        });
        const reason = await createRejectionReason({
          input: { label: 'Not a fit', category: 'other' },
          session: t.adminSession,
        });
        await rejectApplication({
          application_id: other.application_id,
          input: { reason_id: reason.id, reason: 'Not a fit', tags: [] },
          session: t.adminSession,
        });

        // Step 5: the admin's own candidate timeline must contain ONLY their own events.
        const detail = await getCandidate({
          candidate_id: self.candidate_id,
          session: t.adminSession,
        });
        const kinds = detail.timeline.map((e) => e.kind);
        expect(kinds).toEqual(['created']);
        // No event may belong to the other candidate's application.
        for (const e of detail.timeline) {
          expect(e.candidate_id).toBe(self.candidate_id);
          if (e.application_id) expect(e.application_id).toBe(self.application_id);
        }
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('does not merge an internal application into an unrelated candidate sharing the email', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const sharedEmail = t.adminSession.email;

        // A recruiter-managed candidate that happens to carry the applicant's email, with its own
        // unrelated pipeline activity (stage move + rejection) on a different requisition.
        const { requisition_id: recruiterReq } = await openRequisition({
          title: 'Recruiter-managed Role',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const ghost = await addCandidate({
          requisition_id: recruiterReq,
          name: 'Someone Else',
          personal_email: sharedEmail,
          session: t.adminSession,
        });
        await moveApplicationStage({
          application_id: ghost.application_id,
          to: 'screening',
          session: t.adminSession,
        });
        const reason = await createRejectionReason({
          input: { label: 'Nope', category: 'other' },
          session: t.adminSession,
        });
        await rejectApplication({
          application_id: ghost.application_id,
          input: { reason_id: reason.id, reason: 'Nope', tags: [] },
          session: t.adminSession,
        });

        // The user now applies internally. This must NOT collapse into the recruiter-managed
        // candidate above just because the email matches.
        const { requisition_id: ownReq } = await openRequisition({
          title: 'My Internal Role',
          kind: 'new',
          session: t.adminSession,
        });
        const self = await applyInternalRequisition({
          requisition_id: ownReq,
          session: t.adminSession,
        });

        expect(self.candidate_id).not.toBe(ghost.candidate_id);
        const detail = await getCandidate({
          candidate_id: self.candidate_id,
          session: t.adminSession,
        });
        const kinds = detail.timeline.map((e) => e.kind);
        expect(kinds).toEqual(['created']);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
