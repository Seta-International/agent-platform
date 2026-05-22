import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupPlans(groupId: string) {
  return useQuery({
    queryKey: plannerKeys.groupPlansWithRollups(groupId),
    queryFn: () => plannerClient.listGroupPlansWithRollups(groupId),
    enabled: !!groupId,
  });
}
