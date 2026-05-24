export type WorkflowRunScope = 'self' | 'group' | 'tenant' | 'instance';

export const workflowsQueryKeys = {
  all: ['copilot', 'workflows'] as const,
  runs: (scope: WorkflowRunScope, workflowId?: string | null) =>
    [...workflowsQueryKeys.all, 'runs', scope, workflowId ?? null] as const,
  run: (runId: string) => [...workflowsQueryKeys.all, 'run', runId] as const,
  runSnapshot: (runId: string) => [...workflowsQueryKeys.all, 'run', runId, 'snapshot'] as const,
  pendingApprovals: () => [...workflowsQueryKeys.all, 'pending-approvals'] as const,
};
