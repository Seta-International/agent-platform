import type { MyTasksResult } from '@seta/planner';
import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { type MyTasksFilters, plannerKeys } from '../../state/query-keys';

export function useMyTasks(filters: MyTasksFilters) {
  return useQuery<MyTasksResult>({
    queryKey: plannerKeys.myTasks(filters),
    queryFn: () =>
      plannerClient.listMyTasks({
        filter: {
          planId: filters.planId,
          groupId: filters.groupId,
          priority: filters.priority,
          due: filters.due,
        },
        sort: filters.sort,
        search: filters.search,
      }),
  });
}
