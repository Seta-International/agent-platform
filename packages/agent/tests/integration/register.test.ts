import { createContributionRegistry } from '@seta/core';
import { registerCoreContributions } from '@seta/core/register';
import { registerIdentityContributions } from '@seta/identity/register';
import { registerPlannerContributions } from '@seta/planner/register';
import type { OrchestrationEvent } from '@seta/shared-orchestration';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerAgent } from '../../src/register.ts';
import { withAgentTestDb } from '../helpers.ts';

async function* stubOrchestration(): AsyncIterable<OrchestrationEvent> {
  yield { kind: 'final', result: { message: 'ok' } };
}

describe('registerAgent', () => {
  it('returns an attach() function that mounts routes on a Hono app', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const reg = createContributionRegistry();
      registerCoreContributions(reg);
      registerIdentityContributions(reg);
      registerPlannerContributions(reg);
      const handle = registerAgent({
        pool,
        databaseUrl,
        reg,
        chatOrchestration: () => stubOrchestration(),
      });
      const app = new Hono();
      handle.attach(app);
      const res = await app.request('/api/agent/v1/health');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        status: string;
        model: { configured: boolean };
        db: { reachable: boolean };
      };
      expect(['ok', 'degraded']).toContain(body.status);
    });
  });

  it('attaches AgentRegistry workflows to the Mastra runtime under their public id', async () => {
    await withAgentTestDb(async ({ pool, databaseUrl }) => {
      const reg = createContributionRegistry();
      registerCoreContributions(reg);
      registerIdentityContributions(reg);
      registerPlannerContributions(reg);
      const handle = registerAgent({
        pool,
        databaseUrl,
        reg,
        chatOrchestration: () => stubOrchestration(),
      });

      // The REST endpoint POST /workflows/runs/:workflowId/start calls
      // mastra.getWorkflow(workflowId) with the WorkflowSpec.id ('assignBySkill'),
      // not the inner Mastra createWorkflow id ('planner.assignBySkill').
      const wf = (handle.mastra as unknown as { getWorkflow: (id: string) => unknown }).getWorkflow(
        'assignBySkill',
      );
      expect(wf).toBeDefined();
      const dedup = (
        handle.mastra as unknown as { getWorkflow: (id: string) => unknown }
      ).getWorkflow('dedupOnCreate');
      expect(dedup).toBeDefined();
    });
  });
});
