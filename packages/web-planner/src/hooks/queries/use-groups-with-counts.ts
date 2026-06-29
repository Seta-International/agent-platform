import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useGroupsWithCounts(opts: { includeDeleted?: boolean } = {}) {
  return useQuery({
    queryKey: plannerKeys.groupsWithCounts(opts.includeDeleted ?? false),
    queryFn: () => plannerClient.listGroupsWithCounts({ includeDeleted: opts.includeDeleted }),
  });
}
