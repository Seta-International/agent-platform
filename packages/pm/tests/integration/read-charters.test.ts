import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { getCharter, listCharters, pmoSignOffCharter, submitCharter } from '../../src/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

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

  it('getCharter returns pmo_approved status, rejected_stage and pmo_signed_off_at', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmoEmail = `pmo-${crypto.randomUUID().slice(0, 8)}@example.test`;
        const pmoResult = await createUser(
          {
            tenant_id: t.tenant_id,
            email: pmoEmail,
            name: 'PMO',
            password: 'correct-horse-battery-staple',
            initial_role: { role_slug: 'pm.pmo', scope_type: 'tenant', scope_id: null },
          },
          { type: 'cli', user_id: null },
        );
        const pmo = buildSession({
          tenant_id: t.tenant_id,
          user_id: pmoResult.user_id,
          email: pmoEmail,
          roles: ['pm.pmo'],
        });
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const { charter_id } = await submitCharter({
          account_id: acc.rows[0].id,
          name: 'P',
          pm_worker_id: t.adminSession.user_id,
          methodology: 'scrum',
          pricing_model: 'fixed_price',
          budget_bmm: 10,
          session: t.adminSession,
        });
        await pmoSignOffCharter({ charter_id, session: pmo });
        const detail = await getCharter({ charter_id, session: t.adminSession });
        expect(detail.status).toBe('pmo_approved');
        expect(detail.rejected_stage).toBeNull();
        expect(detail.pmo_signed_off_at).not.toBeNull();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
