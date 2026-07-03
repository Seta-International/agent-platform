import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { editWorker } from '../../src/backend/domain/edit-worker.ts';
import { getWorker, listWorkers } from '../../src/backend/domain/read-workers.ts';
import { type SeededTenant, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function withDb(fn: (a: { pool: Pool; t: SeededTenant }) => Promise<void>): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      await fn({ pool, t });
    } finally {
      resetPeopleDb();
      resetCoreDb();
      await closePools();
    }
  });
}

describe('worker personal_email + cv_storage_key', () => {
  it('round-trips personal_email through create → get → list', () =>
    withDb(async ({ t }) => {
      const { worker_id } = await createWorker({
        session: t.adminSession,
        full_name: 'CV Test Person',
        personal_email: 'cv.test@gmail.com',
      });

      const got = await getWorker({ worker_id, session: t.adminSession });
      expect(got.personal_email).toBe('cv.test@gmail.com');
      expect(got.cv_storage_key).toBeNull();

      const { rows } = await listWorkers(t.adminSession, { ids: [worker_id] });
      expect(rows[0]?.personal_email).toBe('cv.test@gmail.com');
    }));

  it('patches personal_email and cv_storage_key via editWorker', () =>
    withDb(async ({ t }) => {
      const { worker_id } = await createWorker({
        session: t.adminSession,
        full_name: 'CV Patch Person',
      });

      await editWorker({
        worker_id,
        session: t.adminSession,
        patch: {
          personal_email: 'patched@gmail.com',
          cv_storage_key: 'tenants/t/people-cv/w/cv.pdf',
        },
      });

      const got = await getWorker({ worker_id, session: t.adminSession });
      expect(got.personal_email).toBe('patched@gmail.com');
      expect(got.cv_storage_key).toBe('tenants/t/people-cv/w/cv.pdf');
    }));
});
