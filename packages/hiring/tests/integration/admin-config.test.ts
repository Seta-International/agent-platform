import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import {
  archiveCloseReason,
  createCloseReason,
  createJdTemplate,
  deleteJdTemplate,
  listCloseReasons,
  listJdTemplates,
} from '../../src/index.ts';
import { inScope, seedTenant } from '../helpers.ts';

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
        await inScope(t.adminSession, () =>
          createJdTemplate({
            input: {
              name: 'Backend role',
              kind: 'role',
              sections: [{ variant: 'external', section: 'about', body: 'About' }],
            },
            session: t.adminSession,
          }),
        );
        const tpls = await inScope(t.adminSession, () => listJdTemplates(t.adminSession));
        expect(tpls[0]?.template.name).toBe('Backend role');
        expect(tpls[0]?.sections).toHaveLength(1);

        const { id } = await inScope(t.adminSession, () =>
          createCloseReason({
            input: { label: 'Position cancelled' },
            session: t.adminSession,
          }),
        );
        await inScope(t.adminSession, () => archiveCloseReason({ id, session: t.adminSession }));
        const reasons = await inScope(t.adminSession, () => listCloseReasons(t.adminSession));
        expect(reasons.find((r) => r.id === id)?.active).toBe(false);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('deleteJdTemplate removes the template atomically; cross-tenant id throws NOT_FOUND', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const a = await seedTenant(pool);
        const b = await seedTenant(pool);
        const { template_id } = await inScope(a.adminSession, () =>
          createJdTemplate({
            input: {
              name: 'To delete',
              kind: 'role',
              sections: [{ variant: 'external', section: 'about', body: 'About' }],
            },
            session: a.adminSession,
          }),
        );

        // another tenant cannot delete it
        await expect(
          inScope(b.adminSession, () => deleteJdTemplate({ template_id, session: b.adminSession })),
        ).rejects.toThrow('not found');
        expect(await inScope(a.adminSession, () => listJdTemplates(a.adminSession))).toHaveLength(
          1,
        );

        // owner deletes it (template + its sections gone)
        await inScope(a.adminSession, () =>
          deleteJdTemplate({ template_id, session: a.adminSession }),
        );
        expect(await inScope(a.adminSession, () => listJdTemplates(a.adminSession))).toHaveLength(
          0,
        );

        // deleting again throws NOT_FOUND
        await expect(
          inScope(a.adminSession, () => deleteJdTemplate({ template_id, session: a.adminSession })),
        ).rejects.toThrow('not found');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
