import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupMemberSummary() {
  return useQuery({
    queryKey: plannerKeys.groupMemberSummary(),
    queryFn: () => plannerClient.getGroupMemberSummary(),
  });
}
