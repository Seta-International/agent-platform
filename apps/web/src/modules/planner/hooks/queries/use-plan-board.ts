import type { BucketRow, LabelRow, PlanRow, TaskWithAssigneesRow } from '@seta/planner';
import { useQueries } from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { plannerKeys } from '../../state/query-keys';

export interface PlanBoardData {
  plan: PlanRow;
  buckets: BucketRow[];
  tasks: TaskWithAssigneesRow[];
  labels: LabelRow[];
}

export function usePlanBoard(planId: string) {
  const queries = useQueries({
    queries: [
      {
        queryKey: plannerKeys.plan(planId),
        queryFn: () => plannerClient.getPlan(planId),
        enabled: !!planId,
      },
      {
        queryKey: [...plannerKeys.plan(planId), 'buckets'] as const,
        queryFn: () => plannerClient.listBuckets(planId),
        enabled: !!planId,
      },
      {
        queryKey: plannerKeys.planTasks(planId, { plan_id: planId }),
        queryFn: () =>
          plannerClient.listTasks({ plan_id: planId, limit: 200 }).then((r) => r.tasks),
        enabled: !!planId,
      },
      {
        queryKey: plannerKeys.planLabels(planId),
        queryFn: () => plannerClient.listLabels(planId),
        enabled: !!planId,
      },
    ],
  });

  const [planQ, bucketsQ, tasksQ, labelsQ] = queries;
  const isPending = queries.some((q) => q.isPending);
  const isError = queries.some((q) => q.isError);

  const data: PlanBoardData | undefined =
    !isPending && !isError
      ? {
          plan: planQ.data as PlanRow,
          buckets: (bucketsQ.data as BucketRow[])
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order),
          tasks: tasksQ.data as TaskWithAssigneesRow[],
          labels: labelsQ.data as LabelRow[],
        }
      : undefined;

  return {
    data,
    isPending,
    isError,
    refetch: () => {
      for (const q of queries) q.refetch();
    },
  };
}
