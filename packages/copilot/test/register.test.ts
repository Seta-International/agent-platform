import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerCopilot } from '../src/index.ts';
import { withCopilotTestDb } from './test-helpers.ts';

describe('registerCopilot', () => {
  it('returns an attach() function that mounts routes on a Hono app', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const handle = registerCopilot({ pool, databaseUrl });
      const app = new Hono();
      handle.attach(app);
      const res = await app.request('/api/copilot/v1/health');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        model: { configured: boolean };
        db: { reachable: boolean };
      };
      expect(['ok', 'degraded']).toContain(body.status);
    });
  });
});
