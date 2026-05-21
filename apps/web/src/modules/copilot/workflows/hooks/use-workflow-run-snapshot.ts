import { useQuery } from '@tanstack/react-query';
import { workflowsApi } from '../api/workflows.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';

export function useWorkflowRunSnapshot(runId: string) {
  return useQuery({
    queryKey: workflowsQueryKeys.runSnapshot(runId),
    queryFn: () => workflowsApi.getRunSnapshot(runId),
    enabled: Boolean(runId),
  });
}
