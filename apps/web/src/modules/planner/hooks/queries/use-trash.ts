import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useTrash() {
  return useQuery({
    queryKey: plannerKeys.trash(),
    queryFn: async () => {
      const [groups, plans, tasksPage] = await Promise.all([
        plannerClient.listGroups(),
        plannerClient.listPlans({ include_deleted: true }),
        plannerClient.listTasks({ include_deleted: true, limit: 200 }),
      ]);
      return {
        groups: groups.filter((g) => g.deleted_at !== null),
        plans: plans.filter((p) => p.deleted_at !== null),
        tasks: tasksPage.tasks.filter((t) => t.deleted_at !== null),
      };
    },
  });
}
