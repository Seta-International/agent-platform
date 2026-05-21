import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupsWithCounts() {
  return useQuery({
    queryKey: plannerKeys.groupsWithCounts(),
    queryFn: plannerClient.listGroupsWithCounts,
  });
}
