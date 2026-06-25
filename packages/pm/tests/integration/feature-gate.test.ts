import type { SessionEnv, SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { buildPmRoutes } from '../../src/backend/http/index.ts';
import { seedTenant } from '../helpers.ts';

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
  app.route('/', buildPmRoutes({} as never));
  return app;
}

function withFeatures(scope: SessionScope, features: string[]): SessionScope {
  return { ...scope, features: new Set(features) };
}

describe('PM feature gate', () => {
  it('404s pm routes when the pm flag is disabled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const { adminSession } = await seedTenant(pool);
        const app = buildApp(withFeatures(adminSession, []));
        const res = await app.request('/api/pm/v1/accounts');
        expect(res.status).toBe(404);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('serves pm routes when the pm flag is enabled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const { adminSession } = await seedTenant(pool);
        const app = buildApp(withFeatures(adminSession, ['pm']));
        const res = await app.request('/api/pm/v1/accounts');
        expect(res.status).toBe(200);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
