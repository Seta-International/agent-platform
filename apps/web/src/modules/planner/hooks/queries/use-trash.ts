import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useTrash() {
  return useQuery({
    queryKey: plannerKeys.trash(),
    queryFn: async () => {
      const [groups, deletedPlans, archivedPlans, tasksPage] = await Promise.all([
        plannerClient.listGroups(),
        plannerClient.listPlans({ include_deleted: true }),
        plannerClient.listPlans({ include_archived: true }),
        plannerClient.listTasks({ include_deleted: true, limit: 200 }),
      ]);
      return {
        groups: groups.filter((g) => g.deleted_at !== null),
        plans: deletedPlans.filter((p) => p.deleted_at !== null),
        archivedPlans: archivedPlans.filter((p) => p.archived_at !== null),
        tasks: tasksPage.tasks.filter((t) => t.deleted_at !== null),
      };
    },
  });
}
