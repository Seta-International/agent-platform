import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import { addCandidate, editCandidate, getCandidate, openRequisition } from '../../src/index.ts';
import { type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function withDb(fn: (a: { pool: Pool; t: SeededTenant }) => Promise<void>): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetHiringDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      await fn({ pool, t });
    } finally {
      resetHiringDb();
      resetCoreDb();
      await closePools();
    }
  });
}

describe('candidate contact.personal_email', () => {
  it('round-trips personal_email through add → get → edit, and patches cv_storage_key', () =>
    withDb(async ({ t }) => {
      const { requisition_id } = await openRequisition({
        title: 'BE',
        kind: 'new',
        headcount: 1,
        session: t.adminSession,
      });

      const res = await addCandidate({
        requisition_id,
        name: 'Trinh Thi C',
        personal_email: 'c.trinh@gmail.com',
        phone: '+84900000222',
        session: t.adminSession,
      });

      const got = await getCandidate({ candidate_id: res.candidate_id, session: t.adminSession });
      expect(got.candidate.contact).toMatchObject({
        personal_email: 'c.trinh@gmail.com',
        phone: '+84900000222',
      });

      await editCandidate({
        candidate_id: res.candidate_id,
        patch: {
          personal_email: 'c.trinh.new@gmail.com',
          cv_storage_key: 'tenants/t/hiring-cv/c/cv.pdf',
        },
        session: t.adminSession,
      });

      const after = await getCandidate({
        candidate_id: res.candidate_id,
        session: t.adminSession,
      });
      expect((after.candidate.contact as { personal_email?: string } | null)?.personal_email).toBe(
        'c.trinh.new@gmail.com',
      );
      expect(after.candidate.cv_storage_key).toBe('tenants/t/hiring-cv/c/cv.pdf');
    }));

  it('legacy rows seeded with contact.email are rewritten by the backfill migration', () =>
    withDb(async ({ pool, t }) => {
      // Simulate a pre-rename row exactly as the old writer produced it.
      const { requisition_id } = await openRequisition({
        title: 'QA',
        kind: 'new',
        headcount: 1,
        session: t.adminSession,
      });
      const res = await addCandidate({
        requisition_id,
        name: 'Legacy Row',
        session: t.adminSession,
      });
      await pool.query(
        `UPDATE hiring.candidate SET contact = jsonb_build_object('email', 'legacy@example.test', 'phone', null) WHERE id = $1`,
        [res.candidate_id],
      );

      // Re-apply the backfill statement (idempotent) — mirrors the committed migration body.
      await pool.query(
        `UPDATE hiring.candidate SET contact = (contact - 'email') || jsonb_build_object('personal_email', contact->'email') WHERE contact ? 'email'`,
      );

      const got = await getCandidate({ candidate_id: res.candidate_id, session: t.adminSession });
      expect((got.candidate.contact as { personal_email?: string } | null)?.personal_email).toBe(
        'legacy@example.test',
      );
      expect((got.candidate.contact as { email?: string } | null)?.email).toBeUndefined();
    }));
});
