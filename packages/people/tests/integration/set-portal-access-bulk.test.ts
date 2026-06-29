import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { createWorker, setPortalAccess, setPortalAccessBulk } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('setPortalAccessBulk', () => {
  it('applies per-row and reports skipped for already-in-state workers', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const a = await createWorker({
          full_name: 'A',
          work_email: 'a@example.test',
          session: t.adminSession,
        });
        const b = await createWorker({
          full_name: 'B',
          work_email: 'b@example.test',
          session: t.adminSession,
        });
        await setPortalAccess({ worker_id: a.worker_id, enabled: true, session: t.adminSession });

        const r = await setPortalAccessBulk({
          worker_ids: [a.worker_id, b.worker_id],
          enabled: true,
          session: t.adminSession,
        });
        const byId = Object.fromEntries(r.results.map((x) => [x.worker_id, x.status]));
        expect(byId[a.worker_id]).toBe('skipped');
        expect(byId[b.worker_id]).toBe('changed');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
