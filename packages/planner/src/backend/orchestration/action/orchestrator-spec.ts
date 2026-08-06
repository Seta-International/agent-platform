import type { OrchestrationSpec } from '@seta/shared-orchestration';

/** Single-step orchestration. The workflow id is also the discriminator the
 *  /chat/resume dispatcher branches on (plan 02), so it must match the value
 *  written onto agent.workflow_runs.workflow_id. */
export const actionOrchestratorSpec: OrchestrationSpec = {
  id: 'planner.action',
  serializationKey: (_runInput, ctx) => `planner:action:${ctx.tenantId}`,
  steps: [{ id: 'orchestrate', agentId: 'planner.action', input: (_s, runIn) => runIn }],
  onComplete: async () => {},
};
