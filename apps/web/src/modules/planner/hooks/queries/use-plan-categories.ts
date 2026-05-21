import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function usePlanCategories(planId: string) {
  return useQuery({
    queryKey: plannerKeys.planCategories(planId),
    queryFn: () => plannerClient.getPlanCategories(planId),
    staleTime: 30_000,
    enabled: !!planId,
  });
}
