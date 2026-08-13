import type { SessionEnv, SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { orgUnit, person } from '../../src/backend/db/schema.ts';
import { createWorker } from '../../src/backend/domain/create-worker.ts';
import { getOrgStructure } from '../../src/backend/domain/org-structure.ts';
import { personPhotoUrl, workerPhotoDownloadUrl } from '../../src/backend/domain/photo.ts';
import { getWorker, listWorkers } from '../../src/backend/domain/read-workers.ts';
import { registerPeoplePhotoRoutes } from '../../src/backend/http/photo.ts';
import { peopleErrorMapper } from '../../src/register.ts';
import { type SeededTenant, seedOrgUnit, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function withDb(fn: (a: { pool: Pool; t: SeededTenant }) => Promise<void>): Promise<void> {
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

/** The sync writes this column directly; tests set it the same way rather than running a pull. */
async function setPhotoKey(worker_id: string, key: string | null): Promise<void> {
  await peopleDb().update(person).set({ photo_storage_key: key }).where(eq(person.id, worker_id));
}

function buildApp(
  scope: SessionScope,
  deps: Parameters<typeof registerPeoplePhotoRoutes>[1] = {},
): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  registerPeoplePhotoRoutes(app, deps);
  app.onError((err, c) => {
    const mapped = peopleErrorMapper(err);
    if (mapped) return c.json(mapped.body, mapped.status as Parameters<typeof c.json>[1]);
    throw err;
  });
  return app;
}

describe('personPhotoUrl', () => {
  it('is null with no stored key, and a stable app path otherwise (never a presigned URL)', () => {
    expect(personPhotoUrl('w-1', null)).toBeNull();
    expect(personPhotoUrl('w-1', 'tenants/t/people-photo/w-1/photo.jpg')).toBe(
      '/api/people/v1/workers/w-1/photo',
    );
  });
});

describe('photo_url on the people read surface', () => {
  it('listWorkers and getWorker carry photo_url, null until a photo is stored', () =>
    withDb(async ({ t }) => {
      const { worker_id } = await createWorker({ full_name: 'Photo One', session: t.adminSession });

      const before = await listWorkers(t.adminSession, { ids: [worker_id] });
      expect(before.rows[0]?.photo_url).toBeNull();
      expect((await getWorker({ worker_id, session: t.adminSession })).photo_url).toBeNull();

      await setPhotoKey(worker_id, `tenants/${t.tenant_id}/people-photo/${worker_id}/photo.jpg`);

      const after = await listWorkers(t.adminSession, { ids: [worker_id] });
      expect(after.rows[0]?.photo_url).toBe(`/api/people/v1/workers/${worker_id}/photo`);
      expect((await getWorker({ worker_id, session: t.adminSession })).photo_url).toBe(
        `/api/people/v1/workers/${worker_id}/photo`,
      );
    }));

  it('getOrgStructure carries photo_url on unit members and on the unit head', () =>
    withDb(async ({ t }) => {
      const unitId = await seedOrgUnit({
        tenant_id: t.tenant_id,
        name: 'Engineering',
        kind: 'function',
      });
      const { worker_id: headId } = await createWorker({
        full_name: 'Head Person',
        org_unit_id: unitId,
        session: t.adminSession,
      } as never);
      const { worker_id: memberId } = await createWorker({
        full_name: 'Member Person',
        org_unit_id: unitId,
        session: t.adminSession,
      } as never);
      await peopleDb()
        .update(orgUnit)
        .set({ head_worker_id: headId })
        .where(eq(orgUnit.id, unitId));
      await setPhotoKey(headId, `tenants/${t.tenant_id}/people-photo/${headId}/photo.jpg`);

      const { units } = await getOrgStructure(t.adminSession);
      const unit = units.find((u) => u.id === unitId);
      expect(unit?.head?.photo_url).toBe(`/api/people/v1/workers/${headId}/photo`);
      expect(unit?.members.find((m) => m.person_id === headId)?.photo_url).toBe(
        `/api/people/v1/workers/${headId}/photo`,
      );
      expect(unit?.members.find((m) => m.person_id === memberId)?.photo_url).toBeNull();
    }));
});

describe('GET /workers/:id/photo', () => {
  it('presigns the stored key and 302s to it, with a redirect cache shorter than the signature', () =>
    withDb(async ({ t }) => {
      const { worker_id } = await createWorker({ full_name: 'Photo Two', session: t.adminSession });
      const key = `tenants/${t.tenant_id}/people-photo/${worker_id}/photo.jpg`;
      await setPhotoKey(worker_id, key);

      let seenTtl = 0;
      const presignDownload = async (args: { key: string; expiresInSeconds: number }) => {
        seenTtl = args.expiresInSeconds;
        return `https://s3.example/get/${args.key}`;
      };
      const app = buildApp(t.adminSession, { presignDownload: presignDownload as never });

      const res = await app.request(`/api/people/v1/workers/${worker_id}/photo`);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`https://s3.example/get/${key}`);

      // A cached redirect must never outlive the signature it points at.
      const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 0);
      expect(maxAge).toBeGreaterThan(0);
      expect(maxAge).toBeLessThan(seenTtl);
      expect(res.headers.get('cache-control')).toContain('private');
    }));

  it('404s when the person has no photo, so the avatar falls back to initials', () =>
    withDb(async ({ t }) => {
      const { worker_id } = await createWorker({
        full_name: 'No Photo',
        session: t.adminSession,
      });
      const app = buildApp(t.adminSession);
      const res = await app.request(`/api/people/v1/workers/${worker_id}/photo`);
      expect(res.status).toBe(404);
    }));

  it('does not leak another tenant photo: an unknown worker id is NOT_FOUND', () =>
    withDb(async ({ t }) => {
      await expect(
        workerPhotoDownloadUrl({ worker_id: crypto.randomUUID(), session: t.adminSession }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    }));
});
