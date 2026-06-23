// packages/hiring/tests/integration/feature-gate.test.ts
import type { SessionEnv, SessionScope } from '@seta/core';
import { applyFeatureFlag, resetFlagCache, resolveFeatures } from '@seta/core';
import { initFlagsForTest, resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import { buildHiringRoutes } from '../../src/backend/http/index.ts';
import { buildSession, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function appFor(session: SessionScope) {
  const app = new Hono<SessionEnv>();
  app.use('*', async (c, next) => {
    c.set('user', session as never);
    await next();
  });
  app.route('/', buildHiringRoutes({} as never));
  return app;
}

describe('hiring feature gate', () => {
  it('returns 404 when hiring flag is off, 200 when it is on', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      await initFlagsForTest([
        { key: 'hiring', description: 'Hiring module (requisitions, candidates, pipeline)' },
      ]);
      resetFlagCache();
      try {
        const t = await seedTenant(pool);

        // GIVEN: no flag row in DB → resolveFeatures returns empty set
        const featuresOff = await resolveFeatures(t.tenant_id, t.admin_user_id, [
          'hiring.recruiter',
        ]);
        const sessionOff: SessionScope = {
          ...buildSession({
            tenant_id: t.tenant_id,
            user_id: t.admin_user_id,
            roles: ['hiring.recruiter'],
          }),
          features: featuresOff,
        };

        // WHEN: GET /api/hiring/v1/requisitions with hiring flag off
        const res1 = await appFor(sessionOff).request('/api/hiring/v1/requisitions');
        // THEN: 404 — feature is invisible
        expect(res1.status).toBe(404);

        // WHEN: an admin enables the hiring flag for this tenant
        await applyFeatureFlag({
          tenantId: t.tenant_id,
          key: 'hiring',
          strategies: [{ kind: 'enabled' }],
          actorUserId: t.admin_user_id,
        });
        // Evict the flag cache so resolveFeatures picks up the new DB row
        resetFlagCache();

        // AND: session re-resolves features (simulates a new login / cache miss)
        const featuresOn = await resolveFeatures(t.tenant_id, t.admin_user_id, [
          'hiring.recruiter',
        ]);
        const sessionOn: SessionScope = {
          ...buildSession({
            tenant_id: t.tenant_id,
            user_id: t.admin_user_id,
            roles: ['hiring.recruiter'],
          }),
          features: featuresOn,
        };

        // THEN: GET /api/hiring/v1/requisitions returns 200
        const res2 = await appFor(sessionOn).request('/api/hiring/v1/requisitions');
        expect(res2.status).toBe(200);
        const body = (await res2.json()) as { requisitions: unknown[] };
        expect(Array.isArray(body.requisitions)).toBe(true);
      } finally {
        resetHiringDb();
        resetCoreDb();
        resetFlagCache();
        await closePools();
      }
    });
  });
});
