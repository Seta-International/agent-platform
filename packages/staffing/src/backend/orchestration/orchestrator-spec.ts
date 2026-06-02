import type { OrchestrationSpec } from '@seta/shared-orchestration';

/** Single-step orchestration: the orchestrator agent owns the whole flow by
 *  delegating to its sub-agent tools. Sub-step cards stream via the run ctx
 *  onEvent sink (Plan 01). */
export const orchestratorSpec: OrchestrationSpec = {
  id: 'staffing.orchestrator',
  serializationKey: (_runInput, ctx) => `staffing:orch:${ctx.tenantId}`,
  steps: [{ id: 'orchestrate', agentId: 'staffing.orchestrator', input: (_s, runIn) => runIn }],
  onComplete: async () => {},
};
