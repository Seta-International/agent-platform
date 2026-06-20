import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { application, candidate, requisition } from '../../src/backend/db/schema.ts';
import { openRequisition } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('hiring schema hardening', () => {
  it('constrains application.stage and defaults version=1', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'R',
          kind: 'new',
          session: t.adminSession,
        });

        const [req] = await hiringDb()
          .select()
          .from(requisition)
          .where(eq(requisition.id, requisition_id));
        expect(req?.version).toBe(1);

        // invalid stage → rejected
        await expect(
          hiringDb().insert(application).values({
            tenant_id: t.tenant_id,
            requisition_id,
            kind: 'external',
            candidate_id: crypto.randomUUID(),
            stage: 'bogus',
          }),
        ).rejects.toThrow();

        // valid pipeline stage → accepted, version defaults to 1
        const [appRow] = await hiringDb()
          .insert(application)
          .values({
            tenant_id: t.tenant_id,
            requisition_id,
            kind: 'external',
            candidate_id: crypto.randomUUID(),
            stage: 'screening',
          })
          .returning();
        expect(appRow?.version).toBe(1);
        expect(appRow?.deleted_at).toBeNull();

        // null stage (e.g. internal applications) → accepted
        const internal = await hiringDb()
          .insert(application)
          .values({
            tenant_id: t.tenant_id,
            requisition_id,
            kind: 'internal',
            worker_id: crypto.randomUUID(),
          })
          .returning({ id: application.id });
        expect(internal).toHaveLength(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('enforces candidate work_email uniqueness per tenant (ignoring soft-deleted)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        const [first] = await hiringDb()
          .insert(candidate)
          .values({ tenant_id: t.tenant_id, name: 'Ada', work_email: 'ada@example.test' })
          .returning({ id: candidate.id });
        expect(first?.id).toBeTruthy();

        // same email, same tenant → rejected by the partial unique index
        await expect(
          hiringDb()
            .insert(candidate)
            .values({ tenant_id: t.tenant_id, name: 'Ada II', work_email: 'ada@example.test' }),
        ).rejects.toThrow();

        // soft-delete the first, then the email frees up for re-use
        await hiringDb()
          .update(candidate)
          .set({ deleted_at: new Date() })
          .where(eq(candidate.id, first!.id));

        const reused = await hiringDb()
          .insert(candidate)
          .values({ tenant_id: t.tenant_id, name: 'Ada III', work_email: 'ada@example.test' })
          .returning({ id: candidate.id });
        expect(reused).toHaveLength(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a requisition whose due_date is after its closed_at', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);

        await expect(
          hiringDb()
            .insert(requisition)
            .values({
              tenant_id: t.tenant_id,
              title: 'Late',
              due_date: '2026-12-01',
              closed_at: new Date('2026-01-01T00:00:00Z'),
              status: 'filled',
            }),
        ).rejects.toThrow();

        const ok = await hiringDb()
          .insert(requisition)
          .values({
            tenant_id: t.tenant_id,
            title: 'On time',
            due_date: '2026-01-01',
            closed_at: new Date('2026-02-01T00:00:00Z'),
            status: 'filled',
          })
          .returning({ id: requisition.id });
        expect(ok).toHaveLength(1);
      } finally {
        resetHiringDb();
        await closePools();
      }
    });
  });
});
