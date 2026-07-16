import type { OrchestrationSpec } from '@seta/shared-orchestration';

export const queryOrchestratorSpec: OrchestrationSpec = {
  id: 'planner.query.orchestrator',
  serializationKey: (_runInput, ctx) => `planner-query:orch:${ctx.tenantId}`,
  steps: [
    { id: 'orchestrate', agentId: 'planner.query.orchestrator', input: (_s, runIn) => runIn },
  ],
  onComplete: async () => {},
};
