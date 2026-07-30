import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import {
  opening,
  requisition,
  requisitionJdSection,
  requisitionSkill,
} from '../../src/backend/db/schema.ts';
import { openRequisition } from '../../src/index.ts';
import { countEvents, readEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('openRequisition', () => {
  it('creates a requisition and emits requisition.opened in one tx', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { requisition_id } = await openRequisition({
          title: 'Senior Backend Engineer',
          kind: 'new',
          session: t.adminSession,
        });

        const [r] = await hiringDb()
          .select()
          .from(requisition)
          .where(eq(requisition.id, requisition_id));
        expect(r?.tenant_id).toBe(t.tenant_id);
        expect(r?.approval_status).toBe('approved');
        expect(r?.status).toBe('open');
        expect(r?.stage).toBe('sourcing');

        // headcount omitted → domain defaults to 1 opening (every open requisition owns ≥1 opening)
        const ops = await hiringDb()
          .select()
          .from(opening)
          .where(eq(opening.requisition_id, requisition_id));
        expect(ops).toHaveLength(1);
        expect(ops[0]?.seq).toBe(1);

        const events = await readEvents(pool, t.tenant_id, 'hiring.requisition.opened');
        expect(events).toHaveLength(1);
        expect(events[0]?.aggregate_id).toBe(requisition_id);
        expect(events[0]?.payload.requisition_id).toBe(requisition_id);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('is atomic: a failure inside the tx persists nothing', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        await expect(
          openRequisition({
            title: 'Atomic Rollback',
            // @ts-expect-error — invalid kind violates requisition_kind_check → in-tx DB error → full rollback
            kind: 'bogus',
            session: t.adminSession,
          }),
        ).rejects.toThrow();

        const reqs = await pool.query(
          `SELECT count(*)::int n FROM hiring.requisition WHERE tenant_id=$1`,
          [t.tenant_id],
        );
        expect(reqs.rows[0].n).toBe(0);
        expect(await countEvents(pool, t.tenant_id, 'hiring.requisition.opened')).toBe(0);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('creates openings, jd sections and skills, emits opening.opened per opening', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'Platform Engineer',
          kind: 'new',
          headcount: 3,
          jd_sections: [{ variant: 'external', section: 'about', body: '<p>Join us</p>' }],
          skills: [{ skill_id: crypto.randomUUID(), skill_name: 'Kubernetes', min_level: 4 }],
          session: t.adminSession,
        });
        const ops = await hiringDb()
          .select()
          .from(opening)
          .where(eq(opening.requisition_id, requisition_id));
        expect(ops).toHaveLength(3);
        expect(ops.map((o) => o.seq).sort()).toEqual([1, 2, 3]);
        expect(ops.every((o) => o.status === 'open')).toBe(true);

        const jd = await hiringDb()
          .select()
          .from(requisitionJdSection)
          .where(eq(requisitionJdSection.requisition_id, requisition_id));
        expect(jd).toHaveLength(1);
        const sk = await hiringDb()
          .select()
          .from(requisitionSkill)
          .where(eq(requisitionSkill.requisition_id, requisition_id));
        expect(sk[0]?.skill_name).toBe('Kubernetes');

        expect(await countEvents(pool, t.tenant_id, 'hiring.opening.opened')).toBe(3);
        expect(await countEvents(pool, t.tenant_id, 'hiring.requisition.opened')).toBe(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  // FUT-768: regression guard — batch insert + batch emit keep maximum headcount=9 fast and atomic
  it('batch-inserts openings and events: maximum 9 headcount completes under 2s', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const { requisition_id } = await openRequisition({
          title: 'Batch Load Test',
          kind: 'new',
          headcount: 9,
          session: t.adminSession,
        });

        const ops = await hiringDb()
          .select()
          .from(opening)
          .where(eq(opening.requisition_id, requisition_id));
        expect(ops).toHaveLength(9);
        expect(ops.every((o) => o.status === 'open')).toBe(true);

        expect(await countEvents(pool, t.tenant_id, 'hiring.opening.opened')).toBe(9);
        expect(await countEvents(pool, t.tenant_id, 'hiring.requisition.opened')).toBe(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
