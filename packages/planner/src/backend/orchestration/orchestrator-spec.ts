import type { OrchestrationSpec } from '@seta/shared-orchestration';

export const qnaOrchestratorSpec: OrchestrationSpec = {
  id: 'planner.qna.orchestrator',
  serializationKey: (_runInput, ctx) => `planner-qna:orch:${ctx.tenantId}`,
  steps: [{ id: 'orchestrate', agentId: 'planner.qna.orchestrator', input: (_s, runIn) => runIn }],
  onComplete: async () => {},
};
