import { vi } from 'vitest';
import type { PlannerPullSurface, RunPlanPullDeps } from '../../src/backend/m365/jobs/plan-pull.ts';
import type { PlansGraph } from '../../src/backend/m365/plans/graph.ts';
import type { M365PlanLinkRepo, M365ResourceEtagRepo } from '../../src/backend/m365/plans/repo.ts';
import { buildSystemSession } from '../../src/backend/m365/system-session.ts';

export const TENANT_ID = '11111111-1111-1111-1111-111111111111';
export const GROUP_ID = '22222222-2222-2222-2222-222222222222';
export const PLAN_ID = '33333333-3333-3333-3333-333333333333';
export const EXTERNAL_PLAN_ID = 'P-EXT-1';

export const OID_TO_USER: Record<string, string> = {
  'OID-1': 'USER-1',
  'OID-2': 'USER-2',
  'OID-3': 'USER-3',
  'OID-4': 'USER-4',
};

export interface BuildGraphResult {
  graph: PlansGraph;
  requestPaths: string[];
}

export function buildStubGraph(fixture: Record<string, unknown>): BuildGraphResult {
  const requestPaths: string[] = [];

  function resolve(path: string): unknown {
    const key = `GET ${path}`;
    if (!(key in fixture)) {
      throw new Error(`unmocked GET ${path}`);
    }
    requestPaths.push(path);
    return JSON.parse(JSON.stringify(fixture[key]));
  }

  const graph: PlansGraph = {
    async getPlan(externalId) {
      return resolve(`/planner/plans/${externalId}`) as Awaited<ReturnType<PlansGraph['getPlan']>>;
    },
    async getPlanDetails(externalId) {
      return resolve(`/planner/plans/${externalId}/details`) as Awaited<
        ReturnType<PlansGraph['getPlanDetails']>
      >;
    },
    async listBuckets(externalId) {
      const page = resolve(`/planner/plans/${externalId}/buckets`) as { value: unknown[] };
      return page.value as Awaited<ReturnType<PlansGraph['listBuckets']>>;
    },
    async listTasks(externalId) {
      const page = resolve(`/planner/plans/${externalId}/tasks`) as { value: unknown[] };
      return page.value as Awaited<ReturnType<PlansGraph['listTasks']>>;
    },
    async getTaskDetails(taskExternalId) {
      return resolve(`/planner/tasks/${taskExternalId}/details`) as Awaited<
        ReturnType<PlansGraph['getTaskDetails']>
      >;
    },
    async getBucketTaskBoardTaskFormat(taskExternalId) {
      return resolve(`/planner/tasks/${taskExternalId}/bucketTaskBoardFormat`) as Awaited<
        ReturnType<PlansGraph['getBucketTaskBoardTaskFormat']>
      >;
    },
    async listGroupPlans() {
      throw new Error('not used in plan pull');
    },
  };

  return { graph, requestPaths };
}

export interface LocalPlanState {
  planTitle: string;
  categoryDescriptions: Record<string, string | null>;
  buckets: Array<{ id: string; name: string; order_hint: string; external_id: string }>;
  tasks: Array<{
    id: string;
    bucket_id: string;
    title: string;
    external_id: string;
    external_etag: string;
  }>;
}

export function buildPlannerMocks(localState: LocalPlanState): PlannerPullSurface {
  let bucketCounter = 0;
  let taskCounter = 0;
  let labelCounter = 0;

  return {
    markPlanSyncStatus: vi.fn().mockResolvedValue(undefined),
    getPlan: vi.fn().mockResolvedValue({
      id: PLAN_ID,
      title: localState.planTitle,
      external_source: 'm365',
      group_id: GROUP_ID,
      category_descriptions: localState.categoryDescriptions,
    }),
    listBuckets: vi.fn().mockResolvedValue(localState.buckets),
    listTasks: vi.fn().mockResolvedValue({ tasks: localState.tasks }),
    createBucket: vi.fn().mockImplementation(async () => {
      bucketCounter++;
      return { id: `BUCKET-LOCAL-${bucketCounter}` };
    }),
    updateBucket: vi.fn().mockResolvedValue(undefined),
    deleteBucket: vi.fn().mockResolvedValue(undefined),
    createTask: vi.fn().mockImplementation(async () => {
      taskCounter++;
      return { id: `TASK-LOCAL-${taskCounter}` };
    }),
    updateTask: vi.fn().mockResolvedValue(undefined),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    setTaskAssignees: vi.fn().mockResolvedValue(undefined),
    updateTaskDetails: vi.fn().mockResolvedValue(undefined),
    setCategoryDescriptions: vi.fn().mockResolvedValue(undefined),
    listLabels: vi.fn().mockResolvedValue([]),
    createLabel: vi.fn().mockImplementation(async () => {
      labelCounter++;
      return { id: `LABEL-LOCAL-${labelCounter}` };
    }),
    updatePlan: vi.fn().mockResolvedValue(undefined),
    markTaskSyncStatus: vi.fn().mockResolvedValue(undefined),
  };
}

export function buildFindUserByEntraOid() {
  return vi
    .fn()
    .mockImplementation(async ({ entra_oid }: { entra_oid: string; tenant_id: string }) => {
      const userId = OID_TO_USER[entra_oid];
      return userId ? { user_id: userId } : null;
    });
}

export function buildDeps(
  graph: PlansGraph,
  planLinkRepo: M365PlanLinkRepo,
  etagRepo: M365ResourceEtagRepo,
  planner: PlannerPullSurface,
): RunPlanPullDeps {
  return {
    graph,
    planLinkRepo,
    etagRepo,
    findUserByEntraOid: buildFindUserByEntraOid(),
    emit: vi.fn().mockResolvedValue(undefined),
    planner,
    buildSystemSession,
  };
}
