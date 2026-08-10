import type { OrchestrationSpec } from '@seta/shared-orchestration';

/** Single-step orchestration. The workflow id is also the discriminator the
 *  /chat/resume dispatcher branches on (plan 02), so it must match the value
 *  written onto agent.workflow_runs.workflow_id. */
/** The one place this id is spelled. Approval cards stamp it into `meta.workflowId`
 *  so /chat/resume can pick the right resume contract without the agent tier
 *  having to know which tools belong to this runtime. */
export const ACTION_WORKFLOW_ID = 'planner.action';

export const actionOrchestratorSpec: OrchestrationSpec = {
  id: ACTION_WORKFLOW_ID,
  serializationKey: (_runInput, ctx) => `planner:action:${ctx.tenantId}`,
  steps: [{ id: 'orchestrate', agentId: 'planner.action', input: (_s, runIn) => runIn }],
  onComplete: async () => {},
};
