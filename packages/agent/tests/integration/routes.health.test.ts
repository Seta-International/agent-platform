import type { OrchestrationEvent } from '@seta/shared-orchestration';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerAgentRoutes } from '../../src/backend/routes.ts';
import { buildMastra } from '../../src/backend/runtime.ts';
import type { SessionLike } from '../../src/backend/types.ts';
import { withAgentTestDb } from '../helpers.ts';

type TestEnv = { Variables: { session: SessionLike } };

async function* stubOrchestration(): AsyncIterable<OrchestrationEvent> {
  yield { kind: 'final', result: { message: 'ok' } };
}

describe('GET /api/agent/v1/health', () => {
  it('returns status, model.configured, db.reachable', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const mastra = buildMastra({ pool, databaseUrl });
      const app = new Hono<TestEnv>();
      registerAgentRoutes(app, {
        chatOrchestration: () => stubOrchestration(),
        mastra: mastra as never,
        pool,
      });
      const res = await app.request('/api/agent/v1/health');
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
