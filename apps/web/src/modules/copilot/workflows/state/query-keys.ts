export type WorkflowRunScope = 'self' | 'group' | 'tenant' | 'instance';

export const workflowsQueryKeys = {
  all: ['copilot', 'workflows'] as const,
  runs: (scope: WorkflowRunScope) => [...workflowsQueryKeys.all, 'runs', scope] as const,
  run: (runId: string) => [...workflowsQueryKeys.all, 'run', runId] as const,
  runSnapshot: (runId: string) => [...workflowsQueryKeys.all, 'run', runId, 'snapshot'] as const,
  pendingApprovals: () => [...workflowsQueryKeys.all, 'pending-approvals'] as const,
};
