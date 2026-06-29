import type { SessionEnv, SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { buildPlannerRoutes } from '../../src/backend/http/index.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

const deps = { streams: new Map() } as never;

function buildApp(scope: SessionScope): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', scope);
    await next();
  });
  app.route('/', buildPlannerRoutes(deps));
  return app;
}

function withFeatures(scope: SessionScope, features: string[]): SessionScope {
  return { ...scope, features: new Set(features) };
}

describe('Planner feature gate', () => {
  it('404s planner routes when the planner flag is disabled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { adminSession } = await seedTenant(pool);
        const app = buildApp(withFeatures(adminSession, []));
        const res = await app.request('/api/planner/v1/plans');
        expect(res.status).toBe(404);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('serves planner routes when the planner flag is enabled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      initPools({ databaseUrl });
      try {
        const { adminSession } = await seedTenant(pool);
        const app = buildApp(withFeatures(adminSession, ['planner']));
        const res = await app.request('/api/planner/v1/plans');
        expect(res.status).toBe(200);
      } finally {
        resetCoreDb();
        await closePools();
      }
    });
  });
});
