import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function usePlanCategories(plan_id: string) {
  return useQuery({
    queryKey: plannerKeys.planCategories(plan_id),
    queryFn: () => plannerClient.getPlanCategories(plan_id),
    staleTime: 30_000,
    enabled: !!plan_id,
  });
}
