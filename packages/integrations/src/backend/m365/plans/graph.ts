import type {
  GraphBucket,
  GraphBucketTaskBoardTaskFormat,
  GraphLikeRead,
  GraphLikeWrite,
  GraphPlan,
  GraphPlanDetails,
  GraphTask,
  GraphTaskDetails,
} from '../jobs/_graph-types.ts';
import { withSpan } from '../observability.ts';

export type {
  GraphBucket,
  GraphBucketTaskBoardTaskFormat,
  GraphLikeWrite,
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

export interface PlansGraphWrite extends PlansGraph {
  patchPlan(
    externalId: string,
    body: Record<string, unknown>,
    etag: string,
  ): Promise<{ object: GraphPlan; etag: string }>;
  patchPlanDetails(
    externalId: string,
    body: Record<string, unknown>,
    etag: string,
  ): Promise<{ object: GraphPlanDetails; etag: string }>;
  postPlan(body: { owner: string; title: string }): Promise<{ object: GraphPlan; etag: string }>;
  deletePlan(externalId: string, etag: string): Promise<void>;

  patchBucket(
    externalId: string,
    body: Record<string, unknown>,
    etag: string,
  ): Promise<{ object: GraphBucket; etag: string }>;
  postBucket(body: {
    planId: string;
    name: string;
    orderHint?: string;
  }): Promise<{ object: GraphBucket; etag: string }>;
  deleteBucket(externalId: string, etag: string): Promise<void>;

  patchTask(
    externalId: string,
    body: Record<string, unknown>,
    etag: string,
  ): Promise<{ object: GraphTask; etag: string }>;
  postTask(body: Record<string, unknown>): Promise<{ object: GraphTask; etag: string }>;
  deleteTask(externalId: string, etag: string): Promise<void>;

  patchTaskDetails(
    externalId: string,
    body: Record<string, unknown>,
    etag: string,
  ): Promise<{ object: GraphTaskDetails; etag: string }>;
  patchBucketTaskBoardTaskFormat(
    taskExternalId: string,
    body: { orderHint: string },
    etag: string,
  ): Promise<{ object: GraphBucketTaskBoardTaskFormat; etag: string }>;
}

export function createPlansGraphWrite(client: GraphLikeRead & GraphLikeWrite): PlansGraphWrite {
  const reads = createPlansGraph(client);
  async function patch<T>(
    path: string,
    body: Record<string, unknown>,
    etag: string,
  ): Promise<{ object: T; etag: string }> {
    const r = (await (client as GraphLikeWrite)
      .api(path)
      .header('If-Match', etag)
      .header('Prefer', 'return=representation')
      .update(body)) as T & { '@odata.etag': string };
    return { object: r, etag: r['@odata.etag'] };
  }
  async function post<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ object: T; etag: string }> {
    const r = (await (client as GraphLikeWrite)
      .api(path)
      .header('Prefer', 'return=representation')
      .post(body)) as T & { '@odata.etag': string };
    return { object: r, etag: r['@odata.etag'] };
  }
  async function del(path: string, etag: string): Promise<void> {
    await (client as GraphLikeWrite).api(path).header('If-Match', etag).delete();
  }
  return {
    ...reads,
    patchPlan: (id, body, etag) => patch<GraphPlan>(`/planner/plans/${id}`, body, etag),
    patchPlanDetails: (id, body, etag) =>
      patch<GraphPlanDetails>(`/planner/plans/${id}/details`, body, etag),
    postPlan: (body) => post<GraphPlan>(`/planner/plans`, body),
    deletePlan: (id, etag) => del(`/planner/plans/${id}`, etag),
    patchBucket: (id, body, etag) => patch<GraphBucket>(`/planner/buckets/${id}`, body, etag),
    postBucket: (body) => post<GraphBucket>(`/planner/buckets`, body),
    deleteBucket: (id, etag) => del(`/planner/buckets/${id}`, etag),
    patchTask: (id, body, etag) => patch<GraphTask>(`/planner/tasks/${id}`, body, etag),
    postTask: (body) => post<GraphTask>(`/planner/tasks`, body),
    deleteTask: (id, etag) => del(`/planner/tasks/${id}`, etag),
    patchTaskDetails: (id, body, etag) =>
      patch<GraphTaskDetails>(`/planner/tasks/${id}/details`, body, etag),
    patchBucketTaskBoardTaskFormat: (id, body, etag) =>
      patch<GraphBucketTaskBoardTaskFormat>(
        `/planner/tasks/${id}/bucketTaskBoardFormat`,
        body,
        etag,
      ),
  };
}
