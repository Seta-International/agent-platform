import type {
  GraphBucket,
  GraphBucketTaskBoardTaskFormat,
  GraphLikeRead,
  GraphPlan,
  GraphPlanDetails,
  GraphTask,
  GraphTaskDetails,
} from '../jobs/_graph-types.ts';

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
    async getPlan(externalId) {
      return client.api(`/planner/plans/${externalId}`).get() as Promise<GraphPlan>;
    },

    async getPlanDetails(externalId) {
      return client.api(`/planner/plans/${externalId}/details`).get() as Promise<GraphPlanDetails>;
    },

    listBuckets(externalId) {
      return pageIterate<GraphBucket>(`/planner/plans/${externalId}/buckets`);
    },

    listTasks(externalId) {
      return pageIterate<GraphTask>(`/planner/plans/${externalId}/tasks`);
    },

    async getTaskDetails(taskExternalId) {
      return client
        .api(`/planner/tasks/${taskExternalId}/details`)
        .get() as Promise<GraphTaskDetails>;
    },

    async getBucketTaskBoardTaskFormat(taskExternalId) {
      return client
        .api(`/planner/tasks/${taskExternalId}/bucketTaskBoardFormat`)
        .get() as Promise<GraphBucketTaskBoardTaskFormat>;
    },

    listGroupPlans(groupExternalId) {
      return pageIterate<GraphPlan>(`/groups/${groupExternalId}/planner/plans`);
    },
  };
}
