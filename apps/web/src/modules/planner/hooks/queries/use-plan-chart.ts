import { useQuery } from '@tanstack/react-query';
import { type PlanChartFilters, plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export function usePlanChart(planId: string, filters?: PlanChartFilters) {
  return useQuery({
    queryKey: plannerKeys.planChart(planId, (filters ?? {}) as Record<string, unknown>),
    queryFn: () => plannerClient.getPlanChart(planId, filters),
    enabled: !!planId,
    refetchOnWindowFocus: true,
  });
}
