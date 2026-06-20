import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { account, allocation, project } from '../../src/backend/db/schema.ts';
import { createAccount } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('allocation worker-rule CHECK', () => {
  it('placeholder must have null worker; committed must have a worker', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { account_id } = await createAccount({ name: 'A', session: t.adminSession });
        const [proj] = await pmDb()
          .insert(project)
          .values({ tenant_id: t.tenant_id, account_id, name: 'P' })
          .returning({ id: project.id });

        // placeholder WITH a worker → rejected
        await expect(
          pmDb().insert(allocation).values({
            tenant_id: t.tenant_id,
            project_id: proj!.id,
            status: 'placeholder',
            worker_id: crypto.randomUUID(),
          }),
        ).rejects.toThrow();

        // committed WITHOUT a worker → rejected
        await expect(
          pmDb().insert(allocation).values({
            tenant_id: t.tenant_id,
            project_id: proj!.id,
            status: 'committed',
          }),
        ).rejects.toThrow();

        // placeholder with null worker → accepted
        const ph = await pmDb()
          .insert(allocation)
          .values({ tenant_id: t.tenant_id, project_id: proj!.id, status: 'placeholder' })
          .returning({ id: allocation.id });
        expect(ph).toHaveLength(1);

        // committed with a worker → accepted
        const named = await pmDb()
          .insert(allocation)
          .values({
            tenant_id: t.tenant_id,
            project_id: proj!.id,
            status: 'committed',
            worker_id: crypto.randomUUID(),
          })
          .returning({ id: allocation.id });
        expect(named).toHaveLength(1);
      } finally {
        resetPmDb();
        await closePools();
      }
    });
  });
});
