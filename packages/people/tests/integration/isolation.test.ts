import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { tenantScoped } from '@seta/shared-rbac';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person } from '../../src/backend/db/schema.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('people org isolation', () => {
  it('never returns another tenant rows and rejects cross-tenant rows', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const a = await seedTenant(pool);
        const b = await seedTenant(pool);

        const personId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO people.person (id, tenant_id, full_name) VALUES ($1, $2, $3)`,
          [personId, a.tenant_id, 'Alice A'],
        );

        const bSession = buildSession({ tenant_id: b.tenant_id, user_id: b.admin_user_id });

        const rowsForB = await peopleDb()
          .select()
          .from(person)
          .where(tenantScoped(person.tenant_id, bSession));
        expect(rowsForB).toHaveLength(0);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
