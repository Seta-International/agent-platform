import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { requisitionJdSection, requisitionSkill } from '../../src/backend/db/schema.ts';
import { openRequisition, setRequisitionJd, setRequisitionSkills } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('set requisition content', () => {
  it('replaces JD sections and skills wholesale', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'R',
          kind: 'new',
          jd_sections: [{ variant: 'external', section: 'about', body: 'old' }],
          skills: [{ skill_name: 'Go' }],
          session: t.adminSession,
        });
        await setRequisitionJd({
          requisition_id,
          sections: [
            { variant: 'external', section: 'about', body: 'new-ext' },
            { variant: 'internal', section: 'about', body: 'new-int' },
          ],
          session: t.adminSession,
        });
        const jd = await hiringDb()
          .select()
          .from(requisitionJdSection)
          .where(eq(requisitionJdSection.requisition_id, requisition_id));
        expect(jd).toHaveLength(2);
        expect(jd.find((s) => s.variant === 'external')?.body).toBe('new-ext');

        await setRequisitionSkills({
          requisition_id,
          skills: [{ skill_name: 'Rust', min_level: 5 }],
          session: t.adminSession,
        });
        const sk = await hiringDb()
          .select()
          .from(requisitionSkill)
          .where(eq(requisitionSkill.requisition_id, requisition_id));
        expect(sk).toHaveLength(1);
        expect(sk[0]?.skill_name).toBe('Rust');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
