import type { SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  getWeeklyReportDetail,
  listKpiExplorer,
  listWeeklyReports,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const WEEK = { iso_year: 2026, iso_week: 29 };

async function liveProject(
  pool: Pool,
  session: SessionScope,
  opts: { name: string; am_person_id?: string; pmo_person_id?: string },
): Promise<string> {
  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name, am_person_id) VALUES ($1,$2,$3) RETURNING id`,
    [session.tenant_id, opts.name, opts.am_person_id ?? null],
  );
  const { project_id: charterId } = await submitCharter({
    account_id: acc.rows[0].id,
    name: opts.name,
    pm_worker_id: session.user_id,
    pmo_worker_id: opts.pmo_person_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  return (await approveCharterTwoStage(charterId, session.tenant_id)).project_id;
}

function scopedSession(tenant_id: string, person_id: string, role = 'pm.manager'): SessionScope {
  return buildSession({
    tenant_id,
    user_id: crypto.randomUUID(),
    roles: [role],
    assignments: [{ role_slug: role, scope_kind: 'self', scope_id: null }],
    worker_id: person_id,
  });
}

describe('project visibility for a week (FUT-799 AC1)', () => {
  it('an AM sees every project on the accounts they manage', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const amPerson = crypto.randomUUID();
        const mine = await liveProject(pool, t.adminSession, {
          name: 'Managed account project',
          am_person_id: amPerson,
        });
        const other = await liveProject(pool, t.adminSession, { name: 'Someone else account' });

        const am = scopedSession(t.tenant_id, amPerson);
        const result = await listKpiExplorer({ ...WEEK, session: am });

        expect(result.rows.map((r) => r.project_id)).toEqual([mine]);
        expect(result.rows.map((r) => r.project_id)).not.toContain(other);
      } finally {
        await closePools();
      }
    });
  });

  it('the weekly list shows an AM the same projects as the Explorer', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const amPerson = crypto.randomUUID();
        const mine = await liveProject(pool, t.adminSession, {
          name: 'Managed account project',
          am_person_id: amPerson,
        });

        const am = scopedSession(t.tenant_id, amPerson);
        const explorer = await listKpiExplorer({ ...WEEK, session: am });
        const weekly = await listWeeklyReports({ ...WEEK, session: am });

        expect(weekly.rows.map((r) => r.project_id)).toEqual([mine]);
        expect(weekly.rows.map((r) => r.project_id)).toEqual(
          explorer.rows.map((r) => r.project_id),
        );
      } finally {
        await closePools();
      }
    });
  });

  it('a PMO sees the project they are named on', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const pmoPerson = crypto.randomUUID();
        const mine = await liveProject(pool, t.adminSession, {
          name: 'PMO owned project',
          pmo_person_id: pmoPerson,
        });
        await liveProject(pool, t.adminSession, { name: 'No PMO named' });

        const pmo = scopedSession(t.tenant_id, pmoPerson, 'pm.pmo');
        const result = await listKpiExplorer({ ...WEEK, session: pmo });

        expect(result.rows.map((r) => r.project_id)).toEqual([mine]);
      } finally {
        await closePools();
      }
    });
  });

  it('an AM can open the weekly detail of a project the list showed them', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const amPerson = crypto.randomUUID();
        const mine = await liveProject(pool, t.adminSession, {
          name: 'Managed account project',
          am_person_id: amPerson,
        });

        const am = scopedSession(t.tenant_id, amPerson);
        const listed = await listWeeklyReports({ ...WEEK, session: am });
        expect(listed.rows.map((r) => r.project_id)).toEqual([mine]);

        const detail = await getWeeklyReportDetail({ ...WEEK, project_id: mine, session: am });
        expect(detail.project_id).toBe(mine);
      } finally {
        await closePools();
      }
    });
  });

  it('a scoped viewer with no relationship to any project sees nothing', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await liveProject(pool, t.adminSession, { name: 'Not theirs' });

        const stranger = scopedSession(t.tenant_id, crypto.randomUUID());

        expect((await listKpiExplorer({ ...WEEK, session: stranger })).rows).toHaveLength(0);
        expect((await listWeeklyReports({ ...WEEK, session: stranger })).rows).toHaveLength(0);
      } finally {
        await closePools();
      }
    });
  });
});
