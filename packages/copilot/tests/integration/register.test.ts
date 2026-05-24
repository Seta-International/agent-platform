import { createContributionRegistry } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { registerIdentityContributions } from '@seta/identity/register';
import { registerPlannerContributions } from '@seta/planner/register';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerCopilot } from '../../src/register.ts';
import { withCopilotTestDb } from '../helpers.ts';

describe('registerCopilot', () => {
  it('returns an attach() function that mounts routes on a Hono app', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const reg = createContributionRegistry();
      registerCoreContributions(reg);
      registerIdentityContributions(reg);
      registerPlannerContributions(reg);
      const handle = registerCopilot({ pool, databaseUrl, reg });
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
