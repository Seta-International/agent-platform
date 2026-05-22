import type {
  GraphBucket,
  GraphBucketTaskBoardTaskFormat,
  GraphLikeRead,
  GraphPlan,
  GraphPlanDetails,
  GraphTask,
  GraphTaskDetails,
} from '../jobs/_graph-types.ts';
import { withSpan } from '../observability.ts';

export type {
  GraphBucket,
  GraphBucketTaskBoardTaskFormat,
  GraphPlan,
  GraphPlanDetails,
  GraphTask,
  GraphTaskDetails,
};

export interface PlansGraph {
  getPlan(externalId: string): Promise<GraphPlan>;
  getPlanDetails(externalId: string): Promise<GraphPlanDetails>;
  listBuckets(externalId: string): Promise<GraphBucket[]>;
  listTasks(externalId: string): Promise<GraphTask[]>;
  getTaskDetails(taskExternalId: string): Promise<GraphTaskDetails>;
  getBucketTaskBoardTaskFormat(taskExternalId: string): Promise<GraphBucketTaskBoardTaskFormat>;
  listGroupPlans(groupExternalId: string): Promise<GraphPlan[]>;
}

export function createPlansGraph(client: GraphLikeRead): PlansGraph {
  async function pageIterate<T>(path: string): Promise<T[]> {
    const collected: T[] = [];
    let currentPath: string = path;

    while (true) {
      const page = (await client.api(currentPath).get()) as {
        value: T[];
        '@odata.nextLink'?: string;
      };
      collected.push(...page.value);
      if (!page['@odata.nextLink']) break;
      currentPath = page['@odata.nextLink'];
    }

    return collected;
  }

  return {
    getPlan(externalId) {
      return withSpan(
        'graph.GET.planner.plan',
        { external_id: externalId },
        () => client.api(`/planner/plans/${externalId}`).get() as Promise<GraphPlan>,
      );
    },

    getPlanDetails(externalId) {
      return withSpan(
        'graph.GET.planner.plan_details',
        { external_id: externalId },
        () => client.api(`/planner/plans/${externalId}/details`).get() as Promise<GraphPlanDetails>,
      );
    },

    listBuckets(externalId) {
      return withSpan('graph.GET.planner.buckets', { external_id: externalId }, () =>
        pageIterate<GraphBucket>(`/planner/plans/${externalId}/buckets`),
      );
    },

    listTasks(externalId) {
      return withSpan('graph.GET.planner.tasks', { external_id: externalId }, () =>
        pageIterate<GraphTask>(`/planner/plans/${externalId}/tasks`),
      );
    },

    getTaskDetails(taskExternalId) {
      return withSpan(
        'graph.GET.planner.task_details',
        { task_external_id: taskExternalId },
        () =>
          client.api(`/planner/tasks/${taskExternalId}/details`).get() as Promise<GraphTaskDetails>,
      );
    },

    getBucketTaskBoardTaskFormat(taskExternalId) {
      return withSpan(
        'graph.GET.planner.task_board_format',
        { task_external_id: taskExternalId },
        () =>
          client
            .api(`/planner/tasks/${taskExternalId}/bucketTaskBoardFormat`)
            .get() as Promise<GraphBucketTaskBoardTaskFormat>,
      );
    },

    listGroupPlans(groupExternalId) {
      return withSpan('graph.GET.planner.group_plans', { group_external_id: groupExternalId }, () =>
        pageIterate<GraphPlan>(`/groups/${groupExternalId}/planner/plans`),
      );
    },
  };
}
