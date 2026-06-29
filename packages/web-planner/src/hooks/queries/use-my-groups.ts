import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useMyGroups() {
  return useQuery({
    queryKey: plannerKeys.myGroups(),
    queryFn: plannerClient.listMyGroups,
  });
}
