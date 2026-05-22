import { createContributionRegistry } from '@seta/core';
import { resetCoreDb } from '@seta/core/internal/test-support';
import { registerCoreContributions } from '@seta/core/register';
import { registerIdentityContributions } from '@seta/identity/register';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it, vi } from 'vitest';
import { buildServerApp, registerAppContributions } from '../src/build.ts';

describe('apps/server smoke', () => {
  it('mounts copilot routes and serves /api/copilot/v1/health', async () => {
    await withTestDb(
      {
        templateDbName: process.env.SETA_TEST_PG_TEMPLATE as string,
        baseUrl: process.env.SETA_TEST_PG_BASE as string,
      },
      async ({ pool, databaseUrl }) => {
        initPools({ databaseUrl });
        try {
          const reg = createContributionRegistry();
          registerCoreContributions(reg);
          registerIdentityContributions(reg);
          registerAppContributions(reg);

          const fakeWorkers = { addJob: vi.fn(async () => {}), shutdown: async () => {} };
          const { app } = buildServerApp(reg, { pool, databaseUrl, workers: fakeWorkers });

          const res = await app.request('/api/copilot/v1/health');
          expect(res.status).toBe(200);

          const body = (await res.json()) as {
            status: string;
            model: { configured: boolean };
            db: { reachable: boolean };
            mastra: { initialized: boolean };
          };
          expect(['ok', 'degraded']).toContain(body.status);
          expect(typeof body.model.configured).toBe('boolean');
          expect(body.db.reachable).toBe(true);
          expect(body.mastra.initialized).toBe(true);
        } finally {
          resetCoreDb();
          await closePools();
        }
      },
    );
  });
});
