import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function useNoDateTasks(planId: string) {
  return useQuery({
    queryKey: plannerKeys.planTasks(planId, { plan_id: planId, no_date: true }),
    queryFn: () => plannerClient.listTasks({ plan_id: planId, no_date: true, limit: 200 }),
    enabled: !!planId,
    staleTime: 30_000,
  });
}
