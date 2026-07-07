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
  createCloseReason,
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
  it('hold → resume → cancel cascades openings and records the close reason', async () => {
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
        const { id: reason_id } = await createCloseReason({
          input: { label: 'No longer needed' },
          session: t.adminSession,
        });
        await closeRequisition({
          requisition_id,
          status: 'cancelled',
          close_reason_id: reason_id,
          session: t.adminSession,
        });
        [r] = await hiringDb().select().from(requisition).where(eq(requisition.id, requisition_id));
        expect(r?.status).toBe('cancelled');
        expect(r?.closed_at).not.toBeNull();
        expect(r?.close_reason_id).toBe(reason_id);
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

  it('rejects cancelling without a close reason, and a reason from another tenant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const other = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'M',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        await expect(
          closeRequisition({ requisition_id, status: 'cancelled', session: t.adminSession }),
        ).rejects.toThrow('close_reason_id is required');

        const { id: otherTenantReasonId } = await createCloseReason({
          input: { label: 'Other tenant reason' },
          session: other.adminSession,
        });
        await expect(
          closeRequisition({
            requisition_id,
            status: 'cancelled',
            close_reason_id: otherTenantReasonId,
            session: t.adminSession,
          }),
        ).rejects.toThrow('unknown close reason');

        // Filling never needs a reason.
        const filled = await closeRequisition({
          requisition_id,
          status: 'filled',
          session: t.adminSession,
        });
        expect(filled.version).toBe(2);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
