import { useQuery } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function usePlanChart(planId: string) {
  return useQuery({
    queryKey: plannerKeys.planChart(planId),
    queryFn: () => plannerClient.getPlanChart(planId),
    enabled: !!planId,
    refetchOnWindowFocus: true,
  });
}
