import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupSyncStatus(groupId: string | null | undefined) {
  return useQuery({
    queryKey: plannerKeys.groupSyncStatus(groupId ?? ''),
    // biome-ignore lint/style/noNonNullAssertion: enabled gate guarantees groupId is set
    queryFn: () => plannerClient.getGroupSyncStatus({ groupId: groupId! }),
    enabled: !!groupId,
    staleTime: 30_000,
  });
}
