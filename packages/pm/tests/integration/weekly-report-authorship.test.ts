import type { SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import {
  addReportComment,
  getWeeklyReportDetail,
  setWeeklyReportClock,
  submitCharter,
  upsertWeeklyReport,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const WEEK = { iso_year: 2026, iso_week: 29 };

function sessionFor(
  tenant_id: string,
  person_id: string,
  role: string,
  scope_kind: 'self' | 'tenant' = 'self',
): SessionScope {
  return buildSession({
    tenant_id,
    user_id: crypto.randomUUID(),
    roles: [role],
    assignments: [{ role_slug: role, scope_kind, scope_id: null }],
    worker_id: person_id,
  });
}

interface Fixture {
  project_id: string;
  em: SessionScope;
  pmo: SessionScope;
  am: SessionScope;
  bod: SessionScope;
  tenantPmo: SessionScope;
}

async function seedProject(pool: Pool): Promise<Fixture> {
  const { tenant_id, adminSession } = await seedTenant(pool);
  const emPerson = crypto.randomUUID();
  const pmoPerson = crypto.randomUUID();
  const amPerson = crypto.randomUUID();

  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name, am_person_id) VALUES ($1,$2,$3) RETURNING id`,
    [tenant_id, 'Authorship Co', amPerson],
  );
  const { project_id: charterId } = await submitCharter({
    account_id: acc.rows[0].id,
    name: 'Authorship Project',
    pm_worker_id: emPerson,
    pmo_worker_id: pmoPerson,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session: adminSession,
  });
  const { project_id } = await approveCharterTwoStage(charterId, tenant_id);

  return {
    project_id,
    em: sessionFor(tenant_id, emPerson, 'pm.manager'),
    pmo: sessionFor(tenant_id, pmoPerson, 'pm.pmo'),
    am: sessionFor(tenant_id, amPerson, 'pm.viewer'),
    bod: sessionFor(tenant_id, crypto.randomUUID(), 'pm.bod', 'tenant'),
    tenantPmo: sessionFor(tenant_id, crypto.randomUUID(), 'pm.pmo', 'tenant'),
  };
}

const report = (project_id: string, session: SessionScope) => ({
  project_id,
  ...WEEK,
  executive_summary: 'Steady week.',
  session,
});

describe('who may author a weekly report (EM + PMO only)', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it("lets the project's EM and PMO submit", async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);

        const byEm = await upsertWeeklyReport(report(f.project_id, f.em));
        expect(byEm.report_id).toBeTruthy();
        const byPmo = await upsertWeeklyReport(report(f.project_id, f.pmo));
        expect(byPmo.report_id).toBeTruthy();
        expect(byPmo.report_id).not.toBe(byEm.report_id);
      } finally {
        await closePools();
      }
    });
  });

  it('refuses a tenant-wide PMO who is not this project’s EM or PMO', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);

        await expect(upsertWeeklyReport(report(f.project_id, f.tenantPmo))).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        await closePools();
      }
    });
  });

  it('refuses the account AM', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);

        await expect(upsertWeeklyReport(report(f.project_id, f.am))).rejects.toMatchObject({
          code: 'FORBIDDEN',
        });
      } finally {
        await closePools();
      }
    });
  });

  it('tells the reader whether they may author, so no dead-end composer opens', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);
        const detailFor = (session: SessionScope) =>
          getWeeklyReportDetail({ project_id: f.project_id, ...WEEK, session });

        expect((await detailFor(f.em)).can_report).toBe(true);
        expect((await detailFor(f.pmo)).can_report).toBe(true);
        expect((await detailFor(f.am)).can_report).toBe(false);
        expect((await detailFor(f.bod)).can_report).toBe(false);
        expect((await detailFor(f.tenantPmo)).can_report).toBe(false);
      } finally {
        await closePools();
      }
    });
  });
});

describe('who may comment on a weekly report (EM, PMO, AM, BoD)', () => {
  beforeEach(() => setWeeklyReportClock(() => new Date('2026-07-15T03:00:00Z')));
  afterAll(() => setWeeklyReportClock());

  it('accepts a comment from every role that can read the report', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const f = await seedProject(pool);
        const { report_id } = await upsertWeeklyReport(report(f.project_id, f.em));

        for (const [role, session] of [
          ['EM', f.em],
          ['PMO', f.pmo],
          ['AM', f.am],
          ['BoD', f.bod],
        ] as const) {
          const { comment_id } = await addReportComment({
            report_id,
            body: `${role} read this.`,
            session,
          });
          expect(comment_id).toBeTruthy();
        }

        const detail = await getWeeklyReportDetail({
          project_id: f.project_id,
          ...WEEK,
          session: f.em,
        });
        expect(detail.reports[0]?.comments).toHaveLength(4);
      } finally {
        await closePools();
      }
    });
  });
});
