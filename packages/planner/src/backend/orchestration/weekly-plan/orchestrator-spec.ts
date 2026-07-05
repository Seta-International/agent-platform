import type { OrchestrationSpec } from '@seta/shared-orchestration';

export const weeklyPlanOrchestratorSpec: OrchestrationSpec = {
  id: 'planner.weeklyPlan.orchestrator',
  serializationKey: (_runInput, ctx) => `planner-weekly:orch:${ctx.tenantId}`,
  steps: [
    { id: 'orchestrate', agentId: 'planner.weeklyPlan.orchestrator', input: (_s, runIn) => runIn },
  ],
  onComplete: async () => {},
};
