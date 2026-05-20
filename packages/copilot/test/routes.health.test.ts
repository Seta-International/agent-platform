import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerCopilotRoutes, type SessionLike } from '../src/backend/routes.ts';
import { buildMastra } from '../src/backend/runtime.ts';
import { withCopilotTestDb } from './test-helpers.ts';

type TestEnv = { Variables: { session: SessionLike } };

describe('GET /api/copilot/v1/health', () => {
  it('returns status, model.configured, db.reachable', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      const app = new Hono<TestEnv>();
      const fakeFactory = Object.assign(() => ({}) as never, { specs: [], names: [] });
      registerCopilotRoutes(app, { factory: fakeFactory as never, mastra: mastra as never });
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
    });
  });
});
