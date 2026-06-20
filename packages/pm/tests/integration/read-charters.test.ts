import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { getCharter, listCharters, submitCharter } from '../../src/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('read charters', () => {
  it('lists and gets a charter scoped to tenant', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const { charter_id } = await submitCharter({
          account_id: acc.rows[0].id,
          name: 'C1',
          pm_worker_id: crypto.randomUUID(),
          session: t.adminSession,
        });
        const list = await listCharters(t.adminSession);
        expect(list.map((c) => c.charter_id)).toContain(charter_id);
        const detail = await getCharter({ charter_id, session: t.adminSession });
        expect(detail.name).toBe('C1');
        expect(detail.status).toBe('submitted');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
