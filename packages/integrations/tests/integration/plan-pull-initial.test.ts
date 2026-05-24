import type { PlannerSessionScope } from '@seta/planner';
import { describe, expect, it, vi } from 'vitest';
import type { PlannerPullSurface, RunPlanPullDeps } from '../../src/backend/m365/jobs/plan-pull.ts';
import { runPlanPull } from '../../src/backend/m365/jobs/plan-pull.ts';
import fixture from '../../src/backend/m365/plans/__fixtures__/initial-pull-plan-with-2-buckets-4-tasks.json' with {
  type: 'json',
};
import type { PlansGraph } from '../../src/backend/m365/plans/graph.ts';
import {
  createM365PlanLinkRepo,
  createM365ResourceEtagRepo,
} from '../../src/backend/m365/plans/repo.ts';
import { createM365GroupLinkRepo } from '../../src/backend/m365/repo.ts';
import { buildSystemSession } from '../../src/backend/m365/system-session.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const GROUP_ID = '22222222-2222-2222-2222-222222222222';
const PLAN_ID = '33333333-3333-3333-3333-333333333333';
const EXTERNAL_PLAN_ID = 'P-EXT-1';

const OID_TO_USER: Record<string, string> = {
  'OID-1': 'USER-1',
  'OID-2': 'USER-2',
  'OID-3': 'USER-3',
  'OID-4': 'USER-4',
};

interface BuildGraphResult {
  graph: PlansGraph;
  requestPaths: string[];
}

function buildStubGraph(): BuildGraphResult {
  const fixtureMap = fixture as Record<string, unknown>;
  const requestPaths: string[] = [];

  function resolve(path: string): unknown {
    const key = `GET ${path}`;
    if (!(key in fixtureMap)) {
      throw new Error(`fixture miss for ${key}`);
    }
    requestPaths.push(path);
    // Return a deep clone so callers can mutate the result safely.
    return JSON.parse(JSON.stringify(fixtureMap[key]));
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
      throw new Error('not used in initial pull');
    },
  };

  return { graph, requestPaths };
}

function buildPlannerMocks(): PlannerPullSurface {
  let bucketCounter = 0;
  let taskCounter = 0;
  let labelCounter = 0;

  return {
    markPlanSyncStatus: vi.fn().mockResolvedValue(undefined),
    getPlan: vi.fn().mockResolvedValue({
      id: PLAN_ID,
      title: '',
      external_source: 'm365',
      group_id: GROUP_ID,
      category_descriptions: {},
    }),
    listBuckets: vi.fn().mockResolvedValue([]),
    listTasks: vi.fn().mockResolvedValue({ tasks: [] }),
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

describe('runPlanPull — initial full pull', () => {
  it('creates 2 buckets, 4 tasks, resolves assignees, persists 16 etag rows + snapshot', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const groupLinkRepo = createM365GroupLinkRepo({ db });
      await groupLinkRepo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_ID,
        externalId: 'G-EXT-1',
        lastSyncedFields: {},
      });

      const planLinkRepo = createM365PlanLinkRepo({ db });
      const link = await planLinkRepo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_ID,
        planId: PLAN_ID,
        externalId: EXTERNAL_PLAN_ID,
        initialSnapshot: {},
      });

      const etagRepo = createM365ResourceEtagRepo({ db });
      const { graph, requestPaths } = buildStubGraph();
      const planner = buildPlannerMocks();
      const emit = vi.fn().mockResolvedValue(undefined);

      const findUserByEntraOid = vi
        .fn()
        .mockImplementation(async ({ entra_oid }: { entra_oid: string; tenant_id: string }) => {
          const userId = OID_TO_USER[entra_oid];
          return userId ? { user_id: userId } : null;
        });

      const deps: RunPlanPullDeps = {
        graph,
        planLinkRepo,
        etagRepo,
        findUserByEntraOid,
        emit,
        planner,
        buildSystemSession,
      };

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: true }, deps);

      // Plan sync status transitions: pulling → idle
      expect(planner.markPlanSyncStatus).toHaveBeenCalledTimes(2);
      const statusCalls = vi.mocked(planner.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      expect(statusCalls[0]).toMatchObject({ plan_id: PLAN_ID, status: 'pulling' });
      expect(statusCalls[1]).toMatchObject({ plan_id: PLAN_ID, status: 'idle' });

      // System session is passed through
      const session = statusCalls[0]!.session as PlannerSessionScope;
      expect(session.actor).toEqual({ kind: 'system', system_id: 'integrations.m365' });

      // 2 buckets created (B-EXT-1, B-EXT-2)
      expect(planner.createBucket).toHaveBeenCalledTimes(2);
      const createBucketCalls = vi.mocked(planner.createBucket).mock.calls.map((c) => c[0]);
      const createdBucketExternalIds = createBucketCalls.map((c) => c.external_id).sort();
      expect(createdBucketExternalIds).toEqual(['B-EXT-1', 'B-EXT-2']);
      for (const call of createBucketCalls) {
        expect(call.external_source).toBe('m365');
        expect(call.external_etag).toBeTruthy();
        expect(call.plan_id).toBe(PLAN_ID);
      }

      // 4 tasks created
      expect(planner.createTask).toHaveBeenCalledTimes(4);
      const createTaskCalls = vi.mocked(planner.createTask).mock.calls.map((c) => c[0]);
      const createdTaskExternalIds = createTaskCalls.map((c) => c.external_id).sort();
      expect(createdTaskExternalIds).toEqual(['T-EXT-1', 'T-EXT-2', 'T-EXT-3', 'T-EXT-4']);
      for (const call of createTaskCalls) {
        expect(call.external_source).toBe('m365');
        expect(call.external_etag).toBeTruthy();
      }

      // markTaskSyncStatus called once per created task with status idle
      expect(planner.markTaskSyncStatus).toHaveBeenCalledTimes(4);
      const taskStatusCalls = vi.mocked(planner.markTaskSyncStatus).mock.calls.map((c) => c[0]);
      for (const call of taskStatusCalls) {
        expect(call.status).toBe('idle');
      }
      const taskStatusIds = taskStatusCalls.map((c) => c.task_id).sort();
      expect(taskStatusIds).toEqual([
        'TASK-LOCAL-1',
        'TASK-LOCAL-2',
        'TASK-LOCAL-3',
        'TASK-LOCAL-4',
      ]);

      // Spot-check Task 4 fields (dates + priority + percent + previewType)
      const t4 = createTaskCalls.find((c) => c.external_id === 'T-EXT-4')!;
      expect(t4.priority).toBe(1);
      expect(t4.percent_complete).toBe(100);
      expect(t4.start_date).toBe('2026-05-01T00:00:00Z');
      expect(t4.due_date).toBe('2026-05-15T00:00:00Z');
      expect(t4.completed_at).toBe('2026-05-14T18:30:00Z');
      expect(t4.preview_type).toBe('checklist');

      // setTaskAssignees called once per task (4 times)
      expect(planner.setTaskAssignees).toHaveBeenCalledTimes(4);
      const assigneeCalls = vi.mocked(planner.setTaskAssignees).mock.calls.map((c) => c[0]);
      const assigneesByTask: Record<string, string[]> = {};
      for (let i = 0; i < createTaskCalls.length; i++) {
        // createTask was called immediately before setTaskAssignees for that task —
        // but ordering is per-task. Use the returned id mapping: TASK-LOCAL-{1..4}
        // correspond to the order tasks appear in walkActions.changedTaskExternalIds.
        const taskId = `TASK-LOCAL-${i + 1}`;
        const call = assigneeCalls.find((a) => a.task_id === taskId)!;
        assigneesByTask[createTaskCalls[i]!.external_id] = call.user_ids;
      }
      expect(assigneesByTask['T-EXT-1']).toEqual(['USER-1']);
      expect(assigneesByTask['T-EXT-2']).toEqual([]);
      expect(assigneesByTask['T-EXT-3']).toEqual(['USER-2']);
      // T-EXT-4 has OID-3, OID-4 — order matches Object.keys order in fixture
      expect(assigneesByTask['T-EXT-4']?.sort()).toEqual(['USER-3', 'USER-4']);

      // emit called for the unresolvable assignee (T3 / OID-UNRESOLVABLE)
      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'integrations.m365.assignee.skipped',
          payload: expect.objectContaining({
            entra_oid: 'OID-UNRESOLVABLE',
            tenant_id: TENANT_ID,
            plan_id: PLAN_ID,
            task_id: 'T-EXT-3',
          }),
        }),
      );

      // updateTaskDetails called 4 times — verify T1 has decoded reference URLs + 1 checklist
      expect(planner.updateTaskDetails).toHaveBeenCalledTimes(4);
      const detailsCalls = vi.mocked(planner.updateTaskDetails).mock.calls.map((c) => c[0]);
      const t1Details = detailsCalls.find((d) => d.task_id === 'TASK-LOCAL-1')!;
      expect(t1Details.references).toHaveLength(2);
      const urls = (t1Details.references ?? []).map((r) => r.url).sort();
      expect(urls).toEqual(['https://example.com/design', 'https://example.com/spec']);
      expect(t1Details.checklist).toHaveLength(1);
      expect(t1Details.checklist![0]).toMatchObject({
        id: 'CL-1-A',
        title: 'Step 1',
        checked: false,
      });

      // Category descriptions: 2 slots filled, 2 labels created
      expect(planner.createLabel).toHaveBeenCalledTimes(2);
      const labelNames = vi
        .mocked(planner.createLabel)
        .mock.calls.map((c) => c[0].name)
        .sort();
      expect(labelNames).toEqual(['Bug', 'Urgent']);

      expect(planner.setCategoryDescriptions).toHaveBeenCalledTimes(1);
      const slotsCall = vi.mocked(planner.setCategoryDescriptions).mock.calls[0]![0];
      expect(slotsCall.plan_id).toBe(PLAN_ID);
      expect(slotsCall.slots[1]).toMatchObject({ name: 'Urgent' });
      expect(slotsCall.slots[3]).toMatchObject({ name: 'Bug' });
      expect(slotsCall.slots[1]?.label_id).toBeTruthy();
      expect(slotsCall.slots[3]?.label_id).toBeTruthy();

      // Etag rows: 1 plan + 1 planDetails + 2 buckets + 4 tasks + 4 taskDetails + 4 boardFormats = 16
      const etagRows = await etagRepo.listForLink(link.id);
      expect(etagRows.length).toBe(16);
      const byType: Record<string, number> = {};
      for (const row of etagRows) {
        byType[row.resourceType] = (byType[row.resourceType] ?? 0) + 1;
      }
      expect(byType).toEqual({
        plan: 1,
        planDetails: 1,
        bucket: 2,
        task: 4,
        taskDetails: 4,
        bucketTaskBoardTaskFormat: 4,
      });

      // Snapshot persisted on link row — includes the tasks map added in Stage C
      const refreshedLink = await planLinkRepo.findByPlan(PLAN_ID);
      expect(refreshedLink).not.toBeNull();
      expect(refreshedLink!.lastSyncedSnapshot).toEqual({
        plan: { title: 'Roadmap' },
        categoryDescriptions: { category1: 'Urgent', category3: 'Bug' },
        tasks: {
          'T-EXT-1': {
            title: 'Task 1',
            priority: 5,
            percent_complete: 0,
            start_date: null,
            due_date: null,
            completed_at: null,
            preview_type: 'automatic',
            order_hint: '8585',
            bucket_external_id: 'B-EXT-1',
          },
          'T-EXT-2': {
            title: 'Task 2',
            priority: 3,
            percent_complete: 50,
            start_date: null,
            due_date: null,
            completed_at: null,
            preview_type: 'description',
            order_hint: '8587',
            bucket_external_id: 'B-EXT-1',
          },
          'T-EXT-3': {
            title: 'Task 3',
            priority: 9,
            percent_complete: 0,
            start_date: null,
            due_date: null,
            completed_at: null,
            preview_type: 'automatic',
            order_hint: '9091',
            bucket_external_id: 'B-EXT-2',
          },
          'T-EXT-4': {
            title: 'Task 4',
            priority: 1,
            percent_complete: 100,
            start_date: '2026-05-01T00:00:00Z',
            due_date: '2026-05-15T00:00:00Z',
            completed_at: '2026-05-14T18:30:00Z',
            preview_type: 'checklist',
            order_hint: '9095',
            bucket_external_id: 'B-EXT-2',
          },
        },
      });

      // Verify total Graph request count: 4 listing + (1 details + 1 boardFormat) * 4 tasks = 12
      expect(requestPaths.length).toBe(12);
    });
  });
});
