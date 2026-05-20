import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupPlans(groupId: string) {
  return useQuery({
    queryKey: plannerKeys.groupPlans(groupId),
    queryFn: () => plannerClient.listPlans({ group_id: groupId }),
    enabled: !!groupId,
  });
}
