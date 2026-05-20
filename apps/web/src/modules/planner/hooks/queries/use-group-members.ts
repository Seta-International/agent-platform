import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: plannerKeys.groupMembers(groupId),
    queryFn: () => plannerClient.listGroupMembers(groupId),
    enabled: !!groupId,
  });
}
