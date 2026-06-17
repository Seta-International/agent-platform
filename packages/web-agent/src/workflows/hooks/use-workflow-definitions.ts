import { useQuery } from '@tanstack/react-query';
import { workflowsApi } from '../api/workflows.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';

export function useWorkflowDefinitions() {
  return useQuery({
    queryKey: workflowsQueryKeys.definitions(),
    queryFn: () => workflowsApi.listDefinitions(),
    staleTime: 5 * 60 * 1000,
  });
}
