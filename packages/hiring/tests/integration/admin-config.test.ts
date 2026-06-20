import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import {
  archiveCloseReason,
  createCloseReason,
  createJdTemplate,
  listCloseReasons,
  listJdTemplates,
} from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('admin config', () => {
  it('creates + lists a JD template and a close reason; archive flips active', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await createJdTemplate({
          input: {
            name: 'Backend role',
            kind: 'role',
            sections: [{ variant: 'external', section: 'about', body: 'About' }],
          },
          session: t.adminSession,
        });
        const tpls = await listJdTemplates(t.adminSession);
        expect(tpls[0]?.template.name).toBe('Backend role');
        expect(tpls[0]?.sections).toHaveLength(1);

        const { id } = await createCloseReason({
          input: { label: 'Position cancelled' },
          session: t.adminSession,
        });
        await archiveCloseReason({ id, session: t.adminSession });
        const reasons = await listCloseReasons(t.adminSession);
        expect(reasons.find((r) => r.id === id)?.active).toBe(false);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
