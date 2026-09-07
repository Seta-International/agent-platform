import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import { projectProjection } from '../../src/backend/db/schema.ts';
import {
  projectProjectionCreated,
  projectProjectionUpdated,
} from '../../src/backend/subscribers/project-projection.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('hiring project projection subscriber carries the project End Date (FUT-984)', () => {
  it('stores date_to on create and refreshes it on update', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const account_id = crypto.randomUUID();
        const project_id = crypto.randomUUID();

        await hiringDb().transaction(async (tx) => {
          await projectProjectionCreated.handler(
            {
              payload: {
                project_id,
                tenant_id: t.tenant_id,
                account_id,
                charter_id: crypto.randomUUID(),
                name: 'Connected Vehicle App',
                date_to: '2026-12-31',
              },
            } as DomainEvent<unknown>,
            { tx },
          );
        });

        const [created] = await hiringDb()
          .select()
          .from(projectProjection)
          .where(eq(projectProjection.project_id, project_id));
        expect(created?.date_to).toBe('2026-12-31');

        await hiringDb().transaction(async (tx) => {
          await projectProjectionUpdated.handler(
            {
              payload: {
                project_id,
                tenant_id: t.tenant_id,
                account_id,
                name: 'Connected Vehicle App',
                date_to: '2026-06-30',
                fields: ['date_to'],
              },
            } as DomainEvent<unknown>,
            { tx },
          );
        });

        const [updated] = await hiringDb()
          .select()
          .from(projectProjection)
          .where(eq(projectProjection.project_id, project_id));
        expect(updated?.date_to).toBe('2026-06-30');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
