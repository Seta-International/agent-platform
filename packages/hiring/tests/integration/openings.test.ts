// packages/hiring/tests/integration/openings.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { opening } from '../../src/backend/db/schema.ts';
import { addOpening, closeOpening, openRequisition } from '../../src/index.ts';
import { countEvents, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('openings', () => {
  it('adds an opening with next seq and closes it with a reason', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { requisition_id } = await openRequisition({
          title: 'O',
          kind: 'new',
          headcount: 1,
          session: t.adminSession,
        });
        const added = await addOpening({ requisition_id, input: {}, session: t.adminSession });
        expect(added.seq).toBe(2);
        expect(await countEvents(pool, t.tenant_id, 'hiring.opening.opened')).toBe(2);

        const closed = await closeOpening({
          opening_id: added.opening_id,
          input: { status: 'closed' },
          session: t.adminSession,
        });
        expect(closed.version).toBe(2);
        const [o] = await hiringDb().select().from(opening).where(eq(opening.id, added.opening_id));
        expect(o?.status).toBe('closed');
        expect(o?.closed_at).not.toBeNull();
        expect(await countEvents(pool, t.tenant_id, 'hiring.opening.closed')).toBe(1);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
