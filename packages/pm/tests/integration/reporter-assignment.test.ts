import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { reporterAssignment } from '../../src/backend/db/schema.ts';
import {
  type ProjectAccessChanged,
  reporterAssignmentOnAccessChanged,
} from '../../src/backend/subscribers/reporter-assignment.ts';
import {
  getReportersAsOf,
  getWeeklyReportDetail,
  listWeeklyReports,
  submitCharter,
} from '../../src/index.ts';
import { approveCharterTwoStage, buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function accessEvent(
  payload: ProjectAccessChanged,
  occurredAt: Date,
  id = crypto.randomUUID(),
): DomainEvent<ProjectAccessChanged> {
  return {
    id,
    occurredAt,
    tenantId: payload.tenant_id,
    aggregateType: 'pm.project',
    aggregateId: payload.project_id,
    eventType: 'pm.project.access.changed',
    eventVersion: 1,
    payload,
  } as never;
}

async function apply(event: DomainEvent<ProjectAccessChanged>) {
  await pmDb().transaction(async (tx) => {
    await reporterAssignmentOnAccessChanged.handler(event, { tx } as never);
  });
}

function readerSession(tenantId: string, userId: string) {
  return buildSession({
    tenant_id: tenantId,
    user_id: userId,
    roles: ['pm.manager'],
    worker_id: crypto.randomUUID(),
  });
}

describe('reporter assignment projection (FUT-610)', () => {
  it('projects owner snapshots temporally, idempotent on event id, queryable as-of a week', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const projectId = crypto.randomUUID();
        const p1 = crypto.randomUUID();
        const p2 = crypto.randomUUID();
        const p3 = crypto.randomUUID();

        // 2026-W-27 (Jul 1) : owners {p1, p2}; 2026-W-29 (Jul 13): owners {p2, p3}.
        const eventA = accessEvent(
          { project_id: projectId, tenant_id: t.tenant_id, owner_worker_ids: [p1, p2] },
          new Date('2026-07-01T08:00:00Z'),
        );
        const eventB = accessEvent(
          { project_id: projectId, tenant_id: t.tenant_id, owner_worker_ids: [p2, p3] },
          new Date('2026-07-13T08:00:00Z'),
        );
        await apply(eventA);
        await apply(eventB);

        // Same event delivered twice (and an old snapshot replayed late) changes nothing.
        await apply(eventB);
        await apply(eventA);

        const rows = await pmDb()
          .select()
          .from(reporterAssignment)
          .where(
            and(
              eq(reporterAssignment.tenant_id, t.tenant_id),
              eq(reporterAssignment.project_id, projectId),
            ),
          );
        expect(rows).toHaveLength(3); // p1 (closed), p2 (open), p3 (open)
        const p1Row = rows.find((r) => r.person_id === p1);
        expect(p1Row?.valid_to?.toISOString()).toBe('2026-07-13T08:00:00.000Z');
        expect(rows.find((r) => r.person_id === p2)?.valid_to).toBeNull();
        expect(rows.find((r) => r.person_id === p3)?.valid_to).toBeNull();

        // As-of week 27: the original pair. As-of week 29: p1 already out, p3 in (p1's row
        // ends mid-week Monday 08:00, so it still overlaps W-29 — query W-30 for the clean cut).
        const session = readerSession(t.tenant_id, t.admin_user_id);
        const w27 = await getReportersAsOf({
          project_ids: [projectId],
          iso_year: 2026,
          iso_week: 27,
          session,
        });
        expect(new Set(w27.map((r) => r.person_id))).toEqual(new Set([p1, p2]));
        const w30 = await getReportersAsOf({
          project_ids: [projectId],
          iso_year: 2026,
          iso_week: 30,
          session,
        });
        expect(new Set(w30.map((r) => r.person_id))).toEqual(new Set([p2, p3]));
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('weekly detail and list honour as-of-week assignment for scoped viewers (FUT-590)', async () => {
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
        const { project_id: charterId } = await submitCharter({
          account_id: acc.rows[0].id,
          name: 'P',
          pm_worker_id: t.adminSession.user_id,
          methodology: 'scrum',
          pricing_model: 'fixed_price',
          budget_bmm: 100,
          session: t.adminSession,
        });
        const { project_id } = await approveCharterTwoStage(charterId, t.tenant_id);

        // Scoped PM persona: pm.manager granted at self scope, person assigned as owner
        // during 2026-W-26..W-29 and removed on the Monday of W-29.
        const personId = crypto.randomUUID();
        const scoped = buildSession({
          tenant_id: t.tenant_id,
          user_id: t.admin_user_id,
          roles: ['pm.manager'],
          assignments: [{ role_slug: 'pm.manager', scope_kind: 'self', scope_id: null }],
          worker_id: personId,
        });
        await apply(
          accessEvent(
            { project_id, tenant_id: t.tenant_id, owner_worker_ids: [personId] },
            new Date('2026-06-22T08:00:00Z'), // W-26 Monday
          ),
        );
        await apply(
          accessEvent(
            { project_id, tenant_id: t.tenant_id, owner_worker_ids: [] },
            new Date('2026-07-13T08:00:00Z'), // W-29 Monday — removed
          ),
        );

        // A week they owned stays readable even though they are off the roster today…
        const detail = await getWeeklyReportDetail({
          project_id,
          iso_year: 2026,
          iso_week: 27,
          session: scoped,
        });
        expect(detail.project_id).toBe(project_id);

        // …but a week after removal is refused (NOT_FOUND: no live read relationship either).
        await expect(
          getWeeklyReportDetail({ project_id, iso_year: 2026, iso_week: 30, session: scoped }),
        ).rejects.toMatchObject({ code: 'NOT_FOUND' });

        // The list follows the same as-of rule for scoped viewers…
        const w27 = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 27,
          session: scoped,
        });
        expect(w27.rows.map((r) => r.project_id)).toContain(project_id);
        const w30 = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 30,
          session: scoped,
        });
        expect(w30.rows).toHaveLength(0);

        // …while a tenant-wide reader (BoD/admin) keeps the organization-wide view.
        const w30Admin = await listWeeklyReports({
          iso_year: 2026,
          iso_week: 30,
          session: t.adminSession,
        });
        expect(w30Admin.rows.map((r) => r.project_id)).toContain(project_id);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('falls back to live project_access for projects the projection has never seen', async () => {
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
        const proj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, status)
           VALUES ($1, $2, 'Legacy', 'active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id],
        );
        const owner = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.project_access (tenant_id, project_id, person_id, level)
           VALUES ($1, $2, $3, 'owner')`,
          [t.tenant_id, proj.rows[0].id, owner],
        );

        const session = readerSession(t.tenant_id, t.admin_user_id);
        const result = await getReportersAsOf({
          project_ids: [proj.rows[0].id],
          iso_year: 2026,
          iso_week: 20,
          session,
        });
        expect(result).toEqual([{ project_id: proj.rows[0].id, person_id: owner }]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('kpi_norm_metric: published+referenced versions are immutable and undeletable', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const normId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.kpi_norm (id, tenant_id, code, revision) VALUES ($1,$2,'T','v1')`,
          [normId, t.tenant_id],
        );
        const metricId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO pm.kpi_norm_metric
             (id, tenant_id, norm_id, category, tier, name, formula_label, component_count,
              component_1_label, green_band, yellow_band, red_band)
           VALUES ($1,$2,$3,'quality','core','M','x',1,'x',
                   '{"op":"lte","value":1}','{"op":"between","min":1,"max":2}','{"op":"gt","value":2}')`,
          [metricId, t.tenant_id, normId],
        );

        // Unreferenced: definition edits are still allowed (norm library corrections).
        await pool.query(
          `UPDATE pm.kpi_norm_metric SET green_band = '{"op":"lte","value":5}' WHERE id = $1`,
          [metricId],
        );

        // Reference it from a KPI record entry, as a saved week would.
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const proj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, status)
           VALUES ($1, $2, 'P', 'active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id],
        );
        const rec = await pool.query(
          `INSERT INTO pm.kpi_record (tenant_id, project_id, iso_year, iso_week, created_by)
           VALUES ($1, $2, 2026, 29, $3) RETURNING id`,
          [t.tenant_id, proj.rows[0].id, t.admin_user_id],
        );
        await pool.query(
          `INSERT INTO pm.kpi_record_entry (tenant_id, record_id, metric_id, component_1_value, computed_value, status)
           VALUES ($1, $2, $3, 1, 1, 'green')`,
          [t.tenant_id, rec.rows[0].id, metricId],
        );

        // In-place definition change without a version bump → rejected.
        await expect(
          pool.query(
            `UPDATE pm.kpi_norm_metric SET green_band = '{"op":"lte","value":9}' WHERE id = $1`,
            [metricId],
          ),
        ).rejects.toThrow(/published and referenced/);

        // Publishing a new version (bump) is the sanctioned path.
        await pool.query(
          `UPDATE pm.kpi_norm_metric
             SET green_band = '{"op":"lte","value":9}', version = version + 1 WHERE id = $1`,
          [metricId],
        );

        // Deleting a referenced metric → rejected.
        await expect(
          pool.query(`DELETE FROM pm.kpi_norm_metric WHERE id = $1`, [metricId]),
        ).rejects.toThrow(/cannot be deleted/);

        // Cosmetic fields stay editable without a bump.
        await pool.query(`UPDATE pm.kpi_norm_metric SET insight = 'note' WHERE id = $1`, [
          metricId,
        ]);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
