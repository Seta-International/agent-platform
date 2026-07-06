import type { SessionEnv, SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { personSkill, worker, workerAllocationProjection } from '../../src/backend/db/schema.ts';
import { registerPeopleWorkersRoutes } from '../../src/backend/http/workers.ts';
import { createWorker, getWorker } from '../../src/index.ts';
import { peopleErrorMapper } from '../../src/register.ts';
import {
  buildSession,
  readEvents,
  type SeededTenant,
  seedOrgUnit,
  seedTenant,
} from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function buildApp(scope: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  registerPeopleWorkersRoutes(app);
  app.onError((err, c) => {
    const mapped = peopleErrorMapper(err);
    if (mapped) return c.json(mapped.body, mapped.status as Parameters<typeof c.json>[1]);
    throw err;
  });
  return app;
}

function withDb(
  fn: (a: { pool: import('pg').Pool; t: SeededTenant }) => Promise<void>,
): Promise<void> {
  return withTestDb(ctx, async ({ pool, databaseUrl }) => {
    resetCoreDb();
    resetPeopleDb();
    initPools({ databaseUrl });
    try {
      const t = await seedTenant(pool);
      await fn({ pool, t });
    } finally {
      resetPeopleDb();
      resetCoreDb();
      await closePools();
    }
  });
}

describe('getWorker enriched fields', () => {
  it('returns job_title, manager_name (derived from unit head), org_unit, accounts[], skills[]', async () => {
    await withDb(async ({ t }) => {
      const { worker_id: head } = await createWorker({
        full_name: 'The Manager',
        session: t.adminSession,
      });
      const unit = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'Delivery',
        kind: 'delivery',
        head_worker_id: head,
      });
      await peopleDb().update(worker).set({ org_unit_id: unit }).where(eq(worker.person_id, head));

      const { worker_id } = await createWorker({
        full_name: 'Rich Worker',
        job_title: 'Senior Engineer',
        org_unit_id: unit,
        session: t.adminSession,
      } as never);

      const accountId = crypto.randomUUID();
      await peopleDb().insert(workerAllocationProjection).values({
        allocation_id: crypto.randomUUID(),
        tenant_id: t.tenant_id,
        worker_id,
        project_id: crypto.randomUUID(),
        account_id: accountId,
        account_name: 'Test Account',
        lead_worker_id: null,
        active: true,
      });

      const skillId = crypto.randomUUID();
      await peopleDb().insert(personSkill).values({
        tenant_id: t.tenant_id,
        person_id: worker_id,
        skill_id: skillId,
        skill_name: 'TypeScript',
        level: 3,
      });

      const w = await getWorker({ worker_id, session: t.adminSession });

      expect(w.job_title).toBe('Senior Engineer');
      expect(w.manager_name).toBe('The Manager');
      expect(w.org_unit_id).toBe(unit);
      expect(w.org_unit_name).toBe('Delivery');
      expect(w.accounts).toEqual([{ id: accountId, name: 'Test Account' }]);
      expect(w.skills).toEqual([{ id: skillId, name: 'TypeScript', level: 3 }]);
    });
  });

  it('returns null manager/org fields when no unit set', async () => {
    await withDb(async ({ t }) => {
      const { worker_id } = await createWorker({
        full_name: 'Solo Worker',
        session: t.adminSession,
      });

      const w = await getWorker({ worker_id, session: t.adminSession });

      expect(w.manager_name).toBeNull();
      expect(w.org_unit_id).toBeNull();
      expect(w.org_unit_name).toBeNull();
      expect(w.accounts).toEqual([]);
      expect(w.skills).toEqual([]);
    });
  });

  it('returns null manager_name when the worker’s unit has no head', async () => {
    await withDb(async ({ t }) => {
      const unit = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'Headless Unit',
        kind: 'operation',
      });
      const { worker_id } = await createWorker({
        full_name: 'Headless Report',
        org_unit_id: unit,
        session: t.adminSession,
      } as never);

      const w = await getWorker({ worker_id, session: t.adminSession });

      expect(w.manager_name).toBeNull();
    });
  });

  it('derives manager_name from the parent unit head when the worker is their own unit head', async () => {
    await withDb(async ({ t }) => {
      const { worker_id: topHead } = await createWorker({
        full_name: 'Top Manager M',
        session: t.adminSession,
      });
      const parentUnit = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'U1',
        kind: 'operation',
        head_worker_id: topHead,
      });
      await peopleDb()
        .update(worker)
        .set({ org_unit_id: parentUnit })
        .where(eq(worker.person_id, topHead));

      const { worker_id: r1 } = await createWorker({
        full_name: 'Report Lead R1',
        session: t.adminSession,
      });
      const childUnit = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'U2',
        kind: 'delivery',
        parent_id: parentUnit,
        head_worker_id: r1,
      });
      await peopleDb()
        .update(worker)
        .set({ org_unit_id: childUnit })
        .where(eq(worker.person_id, r1));

      const w1 = await getWorker({ worker_id: r1, session: t.adminSession });
      expect(w1.manager_name).toBe('Top Manager M');

      const { worker_id: w } = await createWorker({
        full_name: 'Rank and File W',
        org_unit_id: childUnit,
        session: t.adminSession,
      } as never);
      const w2 = await getWorker({ worker_id: w, session: t.adminSession });
      expect(w2.manager_name).toBe('Report Lead R1');
    });
  });

  it('returns onboarding_date and offboarding_date from employment_period', async () => {
    await withDb(async ({ t }) => {
      const { worker_id } = await createWorker({
        full_name: 'Dated Worker',
        start_date: '2024-01-15',
        session: t.adminSession,
      } as never);

      const w = await getWorker({ worker_id, session: t.adminSession });

      expect(w.onboarding_date).toBe('2024-01-15');
      expect(w.offboarding_date).toBeNull();
    });
  });
});

describe('person-skill HTTP routes', () => {
  it('POST /workers/:id/skills adds skill, visible in getWorker, emits event', async () => {
    await withDb(async ({ pool, t }) => {
      const { worker_id } = await createWorker({
        full_name: 'Skill Worker',
        session: t.adminSession,
      });

      const catId = crypto.randomUUID();
      const skillId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`, [
        catId,
        t.tenant_id,
        'Engineering',
      ]);
      await pool.query(
        `INSERT INTO core.skill (id, tenant_id, category_id, name) VALUES ($1,$2,$3,$4)`,
        [skillId, t.tenant_id, catId, 'Go'],
      );

      const app = buildApp(t.adminSession);
      const res = await app.request(`/api/people/v1/workers/${worker_id}/skills`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });
      expect(res.status).toBe(201);

      const w = await getWorker({ worker_id, session: t.adminSession });
      expect(w.skills).toEqual([{ id: skillId, name: 'Go', level: null }]);

      const events = await readEvents(pool, t.tenant_id, 'people.person.skill.added');
      expect(events).toHaveLength(1);
      expect(events[0]?.aggregate_id).toBe(worker_id);
    });
  });

  it('PATCH /workers/:id/skills/:skillId sets the level, visible in getWorker', async () => {
    await withDb(async ({ pool, t }) => {
      const { worker_id } = await createWorker({
        full_name: 'Level Skill Worker',
        session: t.adminSession,
      });

      const catId = crypto.randomUUID();
      const skillId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`, [
        catId,
        t.tenant_id,
        'Engineering',
      ]);
      await pool.query(
        `INSERT INTO core.skill (id, tenant_id, category_id, name) VALUES ($1,$2,$3,$4)`,
        [skillId, t.tenant_id, catId, 'Kotlin'],
      );

      const app = buildApp(t.adminSession);
      await app.request(`/api/people/v1/workers/${worker_id}/skills`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });

      const res = await app.request(`/api/people/v1/workers/${worker_id}/skills/${skillId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level: 5 }),
      });
      expect(res.status).toBe(204);

      const w = await getWorker({ worker_id, session: t.adminSession });
      expect(w.skills).toEqual([{ id: skillId, name: 'Kotlin', level: 5 }]);
    });
  });

  it('DELETE /workers/:id/skills/:skillId removes skill', async () => {
    await withDb(async ({ pool, t }) => {
      const { worker_id } = await createWorker({
        full_name: 'Remove Skill Worker',
        session: t.adminSession,
      });

      const catId = crypto.randomUUID();
      const skillId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`, [
        catId,
        t.tenant_id,
        'Engineering',
      ]);
      await pool.query(
        `INSERT INTO core.skill (id, tenant_id, category_id, name) VALUES ($1,$2,$3,$4)`,
        [skillId, t.tenant_id, catId, 'Rust'],
      );

      const app = buildApp(t.adminSession);
      await app.request(`/api/people/v1/workers/${worker_id}/skills`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });

      const delRes = await app.request(`/api/people/v1/workers/${worker_id}/skills/${skillId}`, {
        method: 'DELETE',
      });
      expect(delRes.status).toBe(204);

      const w = await getWorker({ worker_id, session: t.adminSession });
      expect(w.skills).toEqual([]);
    });
  });

  it('POST /workers/:id/skills by viewer session returns 403', async () => {
    await withDb(async ({ pool, t }) => {
      const { worker_id } = await createWorker({
        full_name: 'Forbidden Worker',
        session: t.adminSession,
      });

      const catId = crypto.randomUUID();
      const skillId = crypto.randomUUID();
      await pool.query(`INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`, [
        catId,
        t.tenant_id,
        'Engineering',
      ]);
      await pool.query(
        `INSERT INTO core.skill (id, tenant_id, category_id, name) VALUES ($1,$2,$3,$4)`,
        [skillId, t.tenant_id, catId, 'Java'],
      );

      const viewerSession = buildSession({
        tenant_id: t.tenant_id,
        user_id: t.admin_user_id,
        roles: ['people.viewer'],
      });
      const app = buildApp(viewerSession);
      const res = await app.request(`/api/people/v1/workers/${worker_id}/skills`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId }),
      });
      expect(res.status).toBe(403);
    });
  });

  it('POST /workers/:id/skills validates body (missing skill_id → 400)', async () => {
    await withDb(async ({ t }) => {
      const { worker_id } = await createWorker({
        full_name: 'Validate Worker',
        session: t.adminSession,
      });

      const app = buildApp(t.adminSession);
      const res = await app.request(`/api/people/v1/workers/${worker_id}/skills`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });
});
