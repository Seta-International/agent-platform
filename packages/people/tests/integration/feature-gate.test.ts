import type { SessionEnv, SessionScope } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetPeopleDb } from '../../src/backend/db/client.ts';
import { buildPeopleRoutes } from '../../src/backend/http/index.ts';
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
  app.route('/', buildPeopleRoutes({} as never));
  return app;
}

function withFeatures(scope: SessionScope, features: string[]): SessionScope {
  return { ...scope, features: new Set(features) };
}

describe('People feature gate', () => {
  it('404s people routes when the people flag is disabled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const { adminSession } = await seedTenant(pool);
        const app = buildApp(withFeatures(adminSession, []));
        const res = await app.request('/api/people/v1/workers');
        expect(res.status).toBe(404);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('serves people routes when the people flag is enabled', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const { adminSession } = await seedTenant(pool);
        const app = buildApp(withFeatures(adminSession, ['people']));
        const res = await app.request('/api/people/v1/workers');
        expect(res.status).toBe(200);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
