import type { SessionEnv } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { buildPmRoutes } from '../../src/backend/http/index.ts';
import { pmErrorMapper } from '../../src/register.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function appFor(session: unknown) {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session as never);
    await next();
  });
  app.route('/', buildPmRoutes({} as never));
  app.onError((err: Error, c) => {
    const mapped = pmErrorMapper(err);
    if (mapped) return c.json(mapped.body as never, mapped.status as never);
    throw err;
  });
  return app;
}

describe('pm allocations HTTP', () => {
  it('POST allocation then GET project allocations returns the row', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool); // pm.manager has pm.project.manage
        const app = appFor(t.adminSession);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const proj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'P',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const projectId = proj.rows[0].id as string;
        const worker = crypto.randomUUID();

        const post = await app.request('/api/pm/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            worker_id: worker,
            role: 'Developer',
            planned_pct: 80,
            status: 'committed',
            // FUT-876: delete requires a not-yet-started allocation, so start in the future.
            date_from: '2099-07-01',
            date_to: '2099-12-31',
          }),
        });
        expect(post.status).toBe(201);

        const get = await app.request(`/api/pm/v1/projects/${projectId}/allocations`);
        expect(get.status).toBe(200);
        const body = (await get.json()) as {
          allocations: Array<{
            allocation_id: string;
            worker_id: string;
            planned_pct: number;
            role: string;
          }>;
        };
        expect(body.allocations).toHaveLength(1);
        expect(body.allocations[0]!.worker_id).toBe(worker);
        expect(body.allocations[0]!.planned_pct).toBe(80);
        expect(body.allocations[0]!.role).toBe('Developer');

        // PATCH the row inline (role + RA%), then DELETE it.
        const allocationId = body.allocations[0]!.allocation_id;
        const patch = await app.request(`/api/pm/v1/allocations/${allocationId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'Tech Lead', planned_pct: 50 }),
        });
        expect(patch.status).toBe(200);
        const afterPatch = (await (
          await app.request(`/api/pm/v1/projects/${projectId}/allocations`)
        ).json()) as { allocations: Array<{ role: string; planned_pct: number }> };
        expect(afterPatch.allocations[0]!.role).toBe('Tech Lead');
        expect(afterPatch.allocations[0]!.planned_pct).toBe(50);

        const del = await app.request(`/api/pm/v1/allocations/${allocationId}`, {
          method: 'DELETE',
        });
        expect(del.status).toBe(204);
        const afterDelete = (await (
          await app.request(`/api/pm/v1/projects/${projectId}/allocations`)
        ).json()) as { allocations: unknown[] };
        expect(afterDelete.allocations).toHaveLength(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('GET effort-check reports peak % across the query params', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const proj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'P',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const projectId = proj.rows[0].id as string;
        const worker = crypto.randomUUID();

        await app.request('/api/pm/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            worker_id: worker,
            planned_pct: 70,
            status: 'committed',
            date_from: '2026-01-01',
            date_to: '2026-12-31',
          }),
        });

        const qs = new URLSearchParams({
          worker_id: worker,
          date_from: '2026-03-01',
          date_to: '2026-06-30',
          planned_pct: '50',
        });
        const check = await app.request(`/api/pm/v1/allocations/effort-check?${qs}`);
        expect(check.status).toBe(200);
        const body = (await check.json()) as { peak_pct: number; exceeds: boolean };
        expect(body.peak_pct).toBe(120);
        expect(body.exceeds).toBe(true);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('POST split ends the current row early and creates a continuation', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const proj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'P',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const projectId = proj.rows[0].id as string;
        const worker = crypto.randomUUID();

        const post = await app.request('/api/pm/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            worker_id: worker,
            planned_pct: 100,
            status: 'committed',
            date_from: '2026-01-01',
            date_to: '2026-10-31',
          }),
        });
        const { allocation_id: allocationId } = (await post.json()) as { allocation_id: string };

        const split = await app.request(`/api/pm/v1/allocations/${allocationId}/split`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_end_date: '2026-02-28',
            continuation: { planned_pct: 50 },
          }),
        });
        expect(split.status).toBe(200);
        const body = (await split.json()) as {
          updated_id: string;
          updated_version: number;
          continuation_id: string;
        };
        expect(body.updated_id).toBe(allocationId);
        expect(body.updated_version).toBe(2);
        expect(body.continuation_id).toBeTruthy();

        const list = (await (
          await app.request(`/api/pm/v1/projects/${projectId}/allocations`)
        ).json()) as { allocations: Array<{ allocation_id: string }> };
        expect(list.allocations).toHaveLength(2);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('POST reassign ends the source and creates allocations on the target projects', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const automate = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'Automate',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const xxx = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'XXX',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const automateId = automate.rows[0].id as string;
        const xxxId = xxx.rows[0].id as string;
        const worker = crypto.randomUUID();

        const post = await app.request('/api/pm/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: automateId,
            worker_id: worker,
            planned_pct: 100,
            status: 'committed',
            date_from: '2026-01-01',
            date_to: '2026-12-31',
          }),
        });
        const { allocation_id: allocationId } = (await post.json()) as { allocation_id: string };

        const reassign = await app.request(`/api/pm/v1/allocations/${allocationId}/reassign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: { date_to: '2026-02-28' },
            targets: [
              { project_id: xxxId, date_from: '2026-03-01', planned_pct: 100, bucket: 'billable' },
            ],
          }),
        });
        expect(reassign.status).toBe(200);
        const body = (await reassign.json()) as {
          source_updated_version: number;
          target_ids: string[];
        };
        expect(body.source_updated_version).toBe(2);
        expect(body.target_ids).toHaveLength(1);

        const list = (await (
          await app.request(`/api/pm/v1/allocations?worker_id=${worker}`)
        ).json()) as { allocations: Array<{ project_name: string }> };
        expect(list.allocations).toHaveLength(2);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('POST reassign/preview returns the impact without mutating anything', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const automate = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'Automate',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const xxx = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'XXX',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const automateId = automate.rows[0].id as string;
        const xxxId = xxx.rows[0].id as string;
        const worker = crypto.randomUUID();

        const post = await app.request('/api/pm/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: automateId,
            worker_id: worker,
            planned_pct: 100,
            status: 'committed',
            date_from: '2026-01-01',
            date_to: '2026-12-31',
          }),
        });
        const { allocation_id: allocationId } = (await post.json()) as { allocation_id: string };

        const preview = await app.request(
          `/api/pm/v1/allocations/${allocationId}/reassign/preview`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source: { date_to: '2026-06-30' },
              targets: [
                {
                  project_id: xxxId,
                  date_from: '2026-07-01',
                  planned_pct: 100,
                  bucket: 'billable',
                },
              ],
            }),
          },
        );
        expect(preview.status).toBe(200);
        const body = (await preview.json()) as {
          source: { project_name: string; date_to: string };
          targets: Array<{ project_name: string }>;
          peak_pct: number;
        };
        expect(body.source.project_name).toBe('Automate');
        expect(body.source.date_to).toBe('2026-06-30');
        expect(body.targets[0]?.project_name).toBe('XXX');
        expect(body.peak_pct).toBe(100);

        // Nothing was actually mutated by the preview call.
        const list = (await (
          await app.request(`/api/pm/v1/allocations?worker_id=${worker}`)
        ).json()) as { allocations: Array<{ date_to: string }> };
        expect(list.allocations).toHaveLength(1);
        expect(list.allocations[0]?.date_to).toBe('2026-12-31');
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('POST reassign-group ends every selected allocation and creates the target', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const app = appFor(t.adminSession);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const watchtower = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'Watchtower',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const projectX = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'ProjectX',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const newProj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, pm_person_id, phase, status)
           VALUES ($1,$2,'NewProj',$3,'initiation','active') RETURNING id`,
          [t.tenant_id, acc.rows[0].id, t.adminSession.user_id],
        );
        const worker = crypto.randomUUID();

        const p1 = await app.request('/api/pm/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: watchtower.rows[0].id,
            worker_id: worker,
            planned_pct: 30,
            status: 'committed',
            date_from: '2026-01-01',
            date_to: '2026-12-31',
          }),
        });
        const { allocation_id: a1 } = (await p1.json()) as { allocation_id: string };
        const p2 = await app.request('/api/pm/v1/allocations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectX.rows[0].id,
            worker_id: worker,
            planned_pct: 70,
            status: 'committed',
            date_from: '2026-01-01',
            date_to: '2026-12-31',
          }),
        });
        const { allocation_id: a2 } = (await p2.json()) as { allocation_id: string };

        const previewRes = await app.request('/api/pm/v1/allocations/reassign-group/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker_id: worker,
            allocation_ids: [a1, a2],
            source: { date_to: '2026-06-30' },
            targets: [
              {
                project_id: newProj.rows[0].id,
                date_from: '2026-07-01',
                planned_pct: 100,
                bucket: 'billable',
              },
            ],
          }),
        });
        expect(previewRes.status).toBe(200);
        const previewBody = (await previewRes.json()) as {
          sources: Array<{ project_name: string }>;
        };
        expect(previewBody.sources).toHaveLength(2);

        const res = await app.request('/api/pm/v1/allocations/reassign-group', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker_id: worker,
            allocation_ids: [a1, a2],
            source: { date_to: '2026-06-30' },
            targets: [
              {
                project_id: newProj.rows[0].id,
                date_from: '2026-07-01',
                planned_pct: 100,
                bucket: 'billable',
              },
            ],
          }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          updated: Array<{ allocation_id: string; version: number }>;
          target_ids: string[];
        };
        expect(body.updated).toHaveLength(2);
        expect(body.target_ids).toHaveLength(1);

        const list = (await (
          await app.request(`/api/pm/v1/allocations?worker_id=${worker}`)
        ).json()) as { allocations: Array<{ date_to: string }> };
        expect(list.allocations).toHaveLength(3);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
