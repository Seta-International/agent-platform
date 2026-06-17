import { useQuery } from '@tanstack/react-query';
import { workflowsApi } from '../api/workflows.ts';
import { workflowsQueryKeys } from '../state/query-keys.ts';

export function usePendingApprovals() {
  return useQuery({
    queryKey: workflowsQueryKeys.pendingApprovals(),
    queryFn: () => workflowsApi.listMyPendingApprovals(),
  });
}
