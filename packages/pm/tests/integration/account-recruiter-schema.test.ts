import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('pm.account_recruiter schema', () => {
  it('enforces one recruiter per account (unique) and exists', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const accountId = crypto.randomUUID();
        await pool.query(`INSERT INTO pm.account (id, tenant_id, name) VALUES ($1,$2,'A')`, [
          accountId,
          t.tenant_id,
        ]);
        const recruiterId = crypto.randomUUID();
        const ins = `INSERT INTO pm.account_recruiter (tenant_id, account_id, recruiter_worker_id) VALUES ($1,$2,$3)`;
        await pool.query(ins, [t.tenant_id, accountId, recruiterId]);
        await expect(pool.query(ins, [t.tenant_id, accountId, recruiterId])).rejects.toThrow();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
