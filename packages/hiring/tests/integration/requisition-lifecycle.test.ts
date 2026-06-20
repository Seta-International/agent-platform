// packages/hiring/tests/integration/requisition-lifecycle.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { opening, requisition } from '../../src/backend/db/schema.ts';
import {
  closeRequisition,
  holdRequisition,
  openRequisition,
  resumeRequisition,
} from '../../src/index.ts';
import { countEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('requisition lifecycle', () => {
  it('hold → resume → cancel cascades openings', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'L',
          kind: 'new',
          headcount: 2,
          session: t.adminSession,
        });
        const h = await holdRequisition({ requisition_id, session: t.adminSession });
        let [r] = await hiringDb()
          .select()
          .from(requisition)
          .where(eq(requisition.id, requisition_id));
        expect(r?.status).toBe('on_hold');
        await resumeRequisition({
          requisition_id,
          expected_version: h.version,
          session: t.adminSession,
        });
        [r] = await hiringDb().select().from(requisition).where(eq(requisition.id, requisition_id));
        expect(r?.status).toBe('open');
        await closeRequisition({ requisition_id, status: 'cancelled', session: t.adminSession });
        [r] = await hiringDb().select().from(requisition).where(eq(requisition.id, requisition_id));
        expect(r?.status).toBe('cancelled');
        expect(r?.closed_at).not.toBeNull();
        const ops = await hiringDb()
          .select()
          .from(opening)
          .where(eq(opening.requisition_id, requisition_id));
        expect(ops.every((o) => o.status === 'cancelled')).toBe(true);
        expect(await countEvents(pool, t.tenant_id, 'hiring.requisition.closed')).toBe(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
