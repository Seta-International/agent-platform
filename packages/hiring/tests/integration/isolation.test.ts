import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { tenantScoped } from '@seta/shared-rbac';
import { withTestDb } from '@seta/shared-testing';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { requisition } from '../../src/backend/db/schema.ts';
import { openRequisition } from '../../src/index.ts';
import { inScope, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('hiring org isolation', () => {
  it('never returns another tenant rows and rejects cross-tenant reads', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const orgA = await seedTenant(pool);
        const orgB = await seedTenant(pool);

        const { requisition_id } = await inScope(orgA.adminSession, () =>
          openRequisition({
            title: 'Org A role',
            kind: 'new',
            session: orgA.adminSession,
          }),
        );

        const visibleToB = await inScope(orgB.adminSession, () =>
          hiringDb()
            .select()
            .from(requisition)
            .where(
              and(
                eq(requisition.id, requisition_id),
                tenantScoped(requisition.tenant_id, orgB.adminSession),
              ),
            ),
        );
        expect(visibleToB).toHaveLength(0);
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
