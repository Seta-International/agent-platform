import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupActivity(groupId: string, days = 7) {
  return useQuery({
    queryKey: plannerKeys.groupActivity(groupId, days),
    queryFn: () => {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      return plannerClient.getGroupActivity(groupId, { since, limit: 8 });
    },
    enabled: !!groupId,
  });
}
