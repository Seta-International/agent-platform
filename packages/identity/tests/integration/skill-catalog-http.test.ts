import {
  createContributionRegistry,
  runMigrations,
  type SessionEnv,
  type SessionScope,
} from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerSkillCatalogRoutes } from '../../src/backend/http/skill-catalog.ts';
import { registerIdentityContributions } from '../../src/register.ts';

const session = (tenant: string, perms: string[]): SessionScope =>
  ({
    tenant_id: tenant,
    user_id: crypto.randomUUID(),
    permissions: new Set(perms),
  }) as unknown as SessionScope;

function buildApp(scope: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  registerSkillCatalogRoutes(app);
  return app;
}

function withDb(fn: (ctx: { tenant: string }) => Promise<void>): Promise<void> {
  return withTestDb(
    {
      templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
      baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
    },
    async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const reg = createContributionRegistry();
        registerCoreContributions(reg);
        registerIdentityContributions(reg);
        await runMigrations(reg, { pool });
        const tenant = crypto.randomUUID();
        await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1, 'Demo', $2)`, [
          tenant,
          `demo-${tenant.slice(0, 8)}`,
        ]);
        await fn({ tenant });
      } finally {
        resetCoreDb();
        await closePools();
      }
    },
  );
}

type RequestFn = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ status: number; body: unknown }>;

async function withHarness(fn: (ctx: { request: RequestFn }) => Promise<void>): Promise<void> {
  await withDb(async ({ tenant }) => {
    const app = buildApp(session(tenant, ['core.skill.read', 'core.skill.manage']));
    const request: RequestFn = async (method, path, body) => {
      const init: RequestInit = { method };
      if (body !== undefined) {
        init.headers = { 'content-type': 'application/json' };
        init.body = JSON.stringify(body);
      }
      const res = await app.request(path, init);
      return { status: res.status, body: await res.json() };
    };
    await fn({ request });
  });
}

describe('skill catalog HTTP', () => {
  it('creates a category then a skill, then lists them', async () => {
    await withHarness(async ({ request }) => {
      const cat = await request('POST', '/api/identity/v1/skill-categories', { name: 'Frontend' });
      expect(cat.status).toBe(201);
      const categoryId = (cat.body as { id: string }).id;

      const skill = await request('POST', '/api/identity/v1/skills', {
        category_id: categoryId,
        name: 'React',
      });
      expect(skill.status).toBe(201);

      const list = await request('GET', '/api/identity/v1/skills?activeOnly=true');
      expect((list.body as { skills: { name: string }[] }).skills.map((s) => s.name)).toEqual([
        'React',
      ]);
    });
  });

  it('returns 409 on a stale version edit', async () => {
    await withHarness(async ({ request }) => {
      const cat = await request('POST', '/api/identity/v1/skill-categories', { name: 'Data' });
      const id = (cat.body as { id: string }).id;
      const res = await request('PATCH', `/api/identity/v1/skill-categories/${id}`, {
        name: 'X',
        expected_version: 99,
      });
      expect(res.status).toBe(409);
    });
  });

  it('returns 400 on missing required field for POST /skill-categories', async () => {
    await withHarness(async ({ request }) => {
      const res = await request('POST', '/api/identity/v1/skill-categories', {});
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe('VALIDATION');
    });
  });

  it('lists categories with activeOnly filter', async () => {
    await withHarness(async ({ request }) => {
      await request('POST', '/api/identity/v1/skill-categories', { name: 'Backend' });
      const list = await request('GET', '/api/identity/v1/skill-categories?activeOnly=true');
      expect(
        (list.body as { categories: { name: string }[] }).categories.map((c) => c.name),
      ).toContain('Backend');
    });
  });
});
