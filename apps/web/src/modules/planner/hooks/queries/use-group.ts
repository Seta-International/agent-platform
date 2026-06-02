import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroup(groupId: string) {
  return useQuery({
    queryKey: plannerKeys.group(groupId),
    queryFn: () => plannerClient.getGroup(groupId, { includeDeleted: true }),
    enabled: !!groupId,
  });
}
