import { vi } from 'vitest';
import type { GraphTask, GraphTaskDetails } from '../../src/m365/jobs/_graph-types.ts';
import type { PlannerPushSurface, RunPlanPushDeps } from '../../src/m365/jobs/plan-push.ts';
import type { PlansGraphWrite } from '../../src/m365/plans/graph.ts';
import type { M365PlanLinkRepo, M365ResourceEtagRepo } from '../../src/m365/plans/repo.ts';
import { buildSystemSession } from '../../src/m365/system-session.ts';

export const TENANT_ID = '11111111-1111-1111-1111-111111111111';
export const GROUP_ID = '22222222-2222-2222-2222-222222222222';
export const PLAN_ID = '33333333-3333-3333-3333-333333333333';
export const TASK_ID = '44444444-4444-4444-4444-444444444444';
export const EXTERNAL_PLAN_ID = 'P-EXT-1';
export const EXTERNAL_TASK_ID = 'T-EXT-1';

export interface GraphCallLog {
  method: 'GET' | 'PATCH' | 'POST' | 'DELETE';
  path: string;
  body?: unknown;
  headers: Record<string, string>;
}

export interface FakeGraphSpec {
  // PATCH /planner/tasks/<id> responses, queued FIFO. Each value is either a
  // fixture to return or an error to throw.
  responses: Record<string, Array<{ status: number; body?: unknown }>>;
}

export interface FakeGraphResult {
  graph: PlansGraphWrite;
  log: GraphCallLog[];
}

class GraphHttpError extends Error {
  statusCode: number;
  code?: string;
  constructor(status: number, body?: { code?: string }) {
    super(`graph error ${status}${body?.code ? ` ${body.code}` : ''}`);
    this.statusCode = status;
    this.code = body?.code;
  }
}

export function buildFakeGraph(spec: FakeGraphSpec): FakeGraphResult {
  const log: GraphCallLog[] = [];

  function take(method: 'PATCH' | 'POST' | 'DELETE' | 'GET', path: string) {
    const key = `${method} ${path}`;
    const q = spec.responses[key];
    if (!q || q.length === 0) {
      throw new Error(`unmocked ${key}`);
    }
    const r = q.shift();
    if (!r) throw new Error(`unmocked ${key}`);
    return r;
  }

  function runResponse(r: { status: number; body?: unknown }): unknown {
    if (r.status < 200 || r.status >= 300) {
      throw new GraphHttpError(r.status, r.body as { code?: string });
    }
    return r.body;
  }

  // The dispatcher uses PlansGraphWrite which extends PlansGraph. We need to
  // mock both the write methods (patchTask, etc.) and the read methods used
  // for 412-refresh (getPlan/listTasks/getTaskDetails/getBucketTaskBoardTaskFormat).
  const graph: PlansGraphWrite = {
    // Read
    async getPlan(externalId) {
      const r = take('GET', `/planner/plans/${externalId}`);
      log.push({ method: 'GET', path: `/planner/plans/${externalId}`, headers: {} });
      return runResponse(r) as Awaited<ReturnType<PlansGraphWrite['getPlan']>>;
    },
    async getPlanDetails(externalId) {
      const r = take('GET', `/planner/plans/${externalId}/details`);
      log.push({ method: 'GET', path: `/planner/plans/${externalId}/details`, headers: {} });
      return runResponse(r) as Awaited<ReturnType<PlansGraphWrite['getPlanDetails']>>;
    },
    async listBuckets(externalId) {
      const r = take('GET', `/planner/plans/${externalId}/buckets`);
      log.push({ method: 'GET', path: `/planner/plans/${externalId}/buckets`, headers: {} });
      const page = runResponse(r) as { value: unknown[] };
      return page.value as Awaited<ReturnType<PlansGraphWrite['listBuckets']>>;
    },
    async listTasks(externalId) {
      const r = take('GET', `/planner/plans/${externalId}/tasks`);
      log.push({ method: 'GET', path: `/planner/plans/${externalId}/tasks`, headers: {} });
      const page = runResponse(r) as { value: unknown[] };
      return page.value as Awaited<ReturnType<PlansGraphWrite['listTasks']>>;
    },
    async getTaskDetails(taskExternalId) {
      const r = take('GET', `/planner/tasks/${taskExternalId}/details`);
      log.push({ method: 'GET', path: `/planner/tasks/${taskExternalId}/details`, headers: {} });
      return runResponse(r) as Awaited<ReturnType<PlansGraphWrite['getTaskDetails']>>;
    },
    async getBucketTaskBoardTaskFormat(taskExternalId) {
      const r = take('GET', `/planner/tasks/${taskExternalId}/bucketTaskBoardFormat`);
      log.push({
        method: 'GET',
        path: `/planner/tasks/${taskExternalId}/bucketTaskBoardFormat`,
        headers: {},
      });
      return runResponse(r) as Awaited<ReturnType<PlansGraphWrite['getBucketTaskBoardTaskFormat']>>;
    },
    async listGroupPlans() {
      throw new Error('listGroupPlans not used in push');
    },

    // Write
    async patchPlan(externalId, body, etag) {
      const r = take('PATCH', `/planner/plans/${externalId}`);
      log.push({
        method: 'PATCH',
        path: `/planner/plans/${externalId}`,
        body,
        headers: { 'If-Match': etag, Prefer: 'return=representation' },
      });
      const out = runResponse(r) as { '@odata.etag': string } & Record<string, unknown>;
      return {
        object: out as unknown as Awaited<ReturnType<PlansGraphWrite['patchPlan']>>['object'],
        etag: out['@odata.etag'],
      };
    },
    async patchPlanDetails(externalId, body, etag) {
      const r = take('PATCH', `/planner/plans/${externalId}/details`);
      log.push({
        method: 'PATCH',
        path: `/planner/plans/${externalId}/details`,
        body,
        headers: { 'If-Match': etag, Prefer: 'return=representation' },
      });
      const out = runResponse(r) as { '@odata.etag': string } & Record<string, unknown>;
      return {
        object: out as unknown as Awaited<
          ReturnType<PlansGraphWrite['patchPlanDetails']>
        >['object'],
        etag: out['@odata.etag'],
      };
    },
    async postPlan(body) {
      const r = take('POST', `/planner/plans`);
      log.push({
        method: 'POST',
        path: `/planner/plans`,
        body,
        headers: { Prefer: 'return=representation' },
      });
      const out = runResponse(r) as { '@odata.etag': string } & Record<string, unknown>;
      return {
        object: out as unknown as Awaited<ReturnType<PlansGraphWrite['postPlan']>>['object'],
        etag: out['@odata.etag'],
      };
    },
    async deletePlan(externalId, etag) {
      const r = take('DELETE', `/planner/plans/${externalId}`);
      log.push({
        method: 'DELETE',
        path: `/planner/plans/${externalId}`,
        headers: { 'If-Match': etag },
      });
      runResponse(r);
    },
    async patchBucket(externalId, body, etag) {
      const r = take('PATCH', `/planner/buckets/${externalId}`);
      log.push({
        method: 'PATCH',
        path: `/planner/buckets/${externalId}`,
        body,
        headers: { 'If-Match': etag, Prefer: 'return=representation' },
      });
      const out = runResponse(r) as { '@odata.etag': string } & Record<string, unknown>;
      return {
        object: out as unknown as Awaited<ReturnType<PlansGraphWrite['patchBucket']>>['object'],
        etag: out['@odata.etag'],
      };
    },
    async postBucket(body) {
      const r = take('POST', `/planner/buckets`);
      log.push({
        method: 'POST',
        path: `/planner/buckets`,
        body,
        headers: { Prefer: 'return=representation' },
      });
      const out = runResponse(r) as { '@odata.etag': string } & Record<string, unknown>;
      return {
        object: out as unknown as Awaited<ReturnType<PlansGraphWrite['postBucket']>>['object'],
        etag: out['@odata.etag'],
      };
    },
    async deleteBucket(externalId, etag) {
      const r = take('DELETE', `/planner/buckets/${externalId}`);
      log.push({
        method: 'DELETE',
        path: `/planner/buckets/${externalId}`,
        headers: { 'If-Match': etag },
      });
      runResponse(r);
    },
    async patchTask(externalId, body, etag) {
      const r = take('PATCH', `/planner/tasks/${externalId}`);
      log.push({
        method: 'PATCH',
        path: `/planner/tasks/${externalId}`,
        body,
        headers: { 'If-Match': etag, Prefer: 'return=representation' },
      });
      const out = runResponse(r) as GraphTask;
      return { object: out, etag: out['@odata.etag'] };
    },
    async postTask(body) {
      const r = take('POST', `/planner/tasks`);
      log.push({
        method: 'POST',
        path: `/planner/tasks`,
        body,
        headers: { Prefer: 'return=representation' },
      });
      const out = runResponse(r) as GraphTask;
      return { object: out, etag: out['@odata.etag'] };
    },
    async deleteTask(externalId, etag) {
      const r = take('DELETE', `/planner/tasks/${externalId}`);
      log.push({
        method: 'DELETE',
        path: `/planner/tasks/${externalId}`,
        headers: { 'If-Match': etag },
      });
      runResponse(r);
    },
    async patchTaskDetails(externalId, body, etag) {
      const r = take('PATCH', `/planner/tasks/${externalId}/details`);
      log.push({
        method: 'PATCH',
        path: `/planner/tasks/${externalId}/details`,
        body,
        headers: { 'If-Match': etag, Prefer: 'return=representation' },
      });
      const out = runResponse(r) as GraphTaskDetails;
      return { object: out, etag: out['@odata.etag'] };
    },
    async patchBucketTaskBoardTaskFormat(externalId, body, etag) {
      const r = take('PATCH', `/planner/tasks/${externalId}/bucketTaskBoardFormat`);
      log.push({
        method: 'PATCH',
        path: `/planner/tasks/${externalId}/bucketTaskBoardFormat`,
        body,
        headers: { 'If-Match': etag, Prefer: 'return=representation' },
      });
      const out = runResponse(r) as { '@odata.etag': string; id: string; orderHint: string };
      return { object: out, etag: out['@odata.etag'] };
    },
  };

  return { graph, log };
}

export interface BuildPushDepsOpts {
  graph: PlansGraphWrite;
  planLinkRepo: M365PlanLinkRepo;
  etagRepo: M365ResourceEtagRepo;
  planner: PlannerPushSurface;
}

export function buildPushDeps(opts: BuildPushDepsOpts): RunPlanPushDeps {
  return {
    graph: opts.graph,
    planLinkRepo: opts.planLinkRepo,
    etagRepo: opts.etagRepo,
    emit: vi.fn().mockResolvedValue(undefined),
    planner: opts.planner,
    buildSystemSession,
  };
}

export function buildPlannerPushMocks(
  initial: { task?: Partial<GraphTask> } = {},
): PlannerPushSurface {
  const baseTask: GraphTask = {
    id: EXTERNAL_TASK_ID,
    '@odata.etag': 'W/"local"',
    planId: EXTERNAL_PLAN_ID,
    bucketId: 'B-1',
    title: 'Updated Title',
    orderHint: ' !',
    percentComplete: 0,
    priority: 5,
    startDateTime: null,
    dueDateTime: null,
    appliedCategories: {},
    assignments: {},
    ...initial.task,
  };
  return {
    markPlanSyncStatus: vi.fn().mockResolvedValue(undefined),
    markTaskSyncStatus: vi.fn().mockResolvedValue(undefined),
    updatePlan: vi.fn().mockResolvedValue(undefined),
    updateBucket: vi.fn().mockResolvedValue(undefined),
    updateTask: vi.fn().mockResolvedValue(undefined),
    readPlan: vi.fn().mockResolvedValue({ title: 'New Title' }),
    readPlanDetails: vi.fn().mockResolvedValue({ categoryDescriptions: {} }),
    readBucket: vi.fn().mockResolvedValue({ name: 'B', orderHint: ' !' }),
    readTask: vi.fn().mockResolvedValue(baseTask),
    readTaskDetails: vi.fn().mockResolvedValue({
      description: null,
      previewType: undefined,
      checklist: {},
      references: {},
    }),
    readTaskOrderHint: vi.fn().mockResolvedValue({ orderHint: ' !' }),
  };
}
