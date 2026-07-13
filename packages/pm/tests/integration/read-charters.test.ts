import { resetCoreDb } from '@seta/core/testing';
import { createUser } from '@seta/identity';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  getCharter,
  getCharterSummary,
  listCharters,
  pmoSignOffCharter,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, seedTenant } from '../helpers.ts';

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
        const { project_id } = await submitCharter({
          account_id: acc.rows[0].id,
          name: 'C1',
          pm_worker_id: crypto.randomUUID(),
          session: t.adminSession,
        });
        const list = await listCharters(t.adminSession);
        expect(list.total).toBe(1);
        expect(list.charters.map((c) => c.charter_id)).toContain(project_id);
        const detail = await getCharter({ charter_id: project_id, session: t.adminSession });
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
        const { project_id } = await submitCharter({
          account_id: acc.rows[0].id,
          name: 'P',
          pm_worker_id: t.adminSession.user_id,
          methodology: 'scrum',
          pricing_model: 'fixed_price',
          budget_bmm: 10,
          session: t.adminSession,
        });
        await pmoSignOffCharter({ charter_id: project_id, session: pmo });
        const detail = await getCharter({ charter_id: project_id, session: t.adminSession });
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

  it('filters by status/account/q, sorts, paginates, and returns total', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmo = await seedReviewer(t.tenant_id, 'pm.pmo');
        const a1 = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'Acct One') RETURNING id`,
          [t.tenant_id],
        );
        const a2 = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'Acct Two') RETURNING id`,
          [t.tenant_id],
        );
        const mk = (account_id: string, name: string) =>
          submitCharter({
            account_id,
            name,
            pm_worker_id: t.adminSession.user_id,
            session: t.adminSession,
          });
        const alpha = await mk(a1.rows[0].id, 'Alpha Gateway');
        await mk(a1.rows[0].id, 'Beta Portal');
        await mk(a2.rows[0].id, 'Gamma Engine');
        // Move Alpha to pmo_approved so we can filter by status.
        await pmoSignOffCharter({ charter_id: alpha.project_id, session: pmo });

        // status filter
        const pmoApproved = await listCharters(t.adminSession, { status: 'pmo_approved' });
        expect(pmoApproved.total).toBe(1);
        expect(pmoApproved.charters[0]!.name).toBe('Alpha Gateway');

        // account filter
        const acct1 = await listCharters(t.adminSession, { account_id: a1.rows[0].id });
        expect(acct1.total).toBe(2);

        // free-text search on name
        const search = await listCharters(t.adminSession, { q: 'gamma' });
        expect(search.total).toBe(1);
        expect(search.charters[0]!.name).toBe('Gamma Engine');

        // sort by name asc
        const byName = await listCharters(t.adminSession, { sort: 'name', dir: 'asc' });
        expect(byName.charters.map((c) => c.name)).toEqual([
          'Alpha Gateway',
          'Beta Portal',
          'Gamma Engine',
        ]);

        // pagination: total reflects the full match, page is bounded by limit
        const page = await listCharters(t.adminSession, { limit: 2, offset: 0 });
        expect(page.total).toBe(3);
        expect(page.charters).toHaveLength(2);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('getCharterSummary returns unfiltered status counts', async () => {
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
        const mk = (name: string) =>
          submitCharter({
            account_id: acc.rows[0].id,
            name,
            pm_worker_id: t.adminSession.user_id,
            methodology: 'scrum',
            pricing_model: 'fixed_price',
            budget_bmm: 5,
            session: t.adminSession,
          });
        const c1 = await mk('S1');
        await mk('S2');
        await approveCharterTwoStage(c1.project_id, t.tenant_id);

        const summary = await getCharterSummary(t.adminSession);
        expect(summary.total).toBe(2);
        expect(summary.submitted).toBe(1);
        expect(summary.approved).toBe(1);
        expect(summary.pmo_approved).toBe(0);

        // The now-active project surfaces under the charter vocabulary as 'approved'.
        const approvedList = await listCharters(t.adminSession, { status: 'approved' });
        expect(approvedList.total).toBe(1);
        expect(approvedList.charters[0]!.charter_id).toBe(c1.project_id);
        expect(approvedList.charters[0]!.status).toBe('approved');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});

async function seedReviewer(tenantId: string, roleSlug: 'pm.pmo' | 'pm.bod') {
  const email = `${roleSlug.replace('.', '-')}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const u = await createUser(
    {
      tenant_id: tenantId,
      email,
      name: roleSlug,
      password: 'correct-horse-battery-staple',
      initial_role: { role_slug: roleSlug, scope_type: 'tenant', scope_id: null },
    },
    { type: 'cli', user_id: null },
  );
  return buildSession({ tenant_id: tenantId, user_id: u.user_id, email, roles: [roleSlug] });
}
