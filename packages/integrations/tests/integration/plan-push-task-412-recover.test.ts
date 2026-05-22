import { describe, expect, it, vi } from 'vitest';
import { runPlanPush } from '../../src/m365/jobs/plan-push.ts';
import type {
  M365PlanLinkRepo,
  M365ResourceEtagRepo,
  PlanLink,
  ResourceEtag,
  ResourceType,
} from '../../src/m365/plans/repo.ts';
import {
  buildFakeGraph,
  buildPlannerPushMocks,
  buildPushDeps,
  EXTERNAL_PLAN_ID,
  EXTERNAL_TASK_ID,
  GROUP_ID,
  PLAN_ID,
  TASK_ID,
  TENANT_ID,
} from './_plan-push-helpers.ts';

function inMemoryRepos() {
  const link: PlanLink = {
    id: 'LINK-1',
    tenantId: TENANT_ID,
    groupId: GROUP_ID,
    planId: PLAN_ID,
    externalId: EXTERNAL_PLAN_ID,
    lastSyncedSnapshot: {},
    syncStatus: 'idle',
    lastError: null,
    lastSyncedAt: null,
    unlinkedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as PlanLink;
  const etags = new Map<string, ResourceEtag>();
  const key = (rt: ResourceType, setaId: string) => `${rt}::${setaId}`;
  const planLinkRepo: M365PlanLinkRepo = {
    async findByPlan(planId) {
      return planId === PLAN_ID ? link : null;
    },
    async findByExternal() {
      return null;
    },
    async listByGroup() {
      return [link];
    },
    async upsert() {
      return link;
    },
    async setSyncStatus() {},
    async persistSnapshot() {},
    async tombstone() {},
    async listAllLive() {
      return [link];
    },
  };
  const etagRepo: M365ResourceEtagRepo = {
    async get(_planLinkId, resourceType, setaId) {
      return etags.get(key(resourceType, setaId)) ?? null;
    },
    async listForLink() {
      return [...etags.values()];
    },
    async upsert(input) {
      etags.set(key(input.resourceType, input.setaId), {
        id: 'E-1',
        tenantId: input.tenantId,
        planLinkId: input.planLinkId,
        resourceType: input.resourceType,
        setaId: input.setaId,
        externalId: input.externalId,
        etag: input.etag,
        lastSyncedFields: input.lastSyncedFields,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as ResourceEtag);
    },
    async remove(_planLinkId, resourceType, setaId) {
      etags.delete(key(resourceType, setaId));
    },
  };
  function seedTaskEtag(opts: { etag: string; lastSyncedFields: unknown }) {
    etagRepo.upsert({
      tenantId: TENANT_ID,
      planLinkId: 'LINK-1',
      resourceType: 'task',
      setaId: TASK_ID,
      externalId: EXTERNAL_TASK_ID,
      etag: opts.etag,
      lastSyncedFields: opts.lastSyncedFields,
    });
  }
  function getTaskEtag() {
    return etags.get(key('task', TASK_ID));
  }
  return { planLinkRepo, etagRepo, seedTaskEtag, getTaskEtag };
}

const SEED_SYNCED = {
  title: 'Old Title',
  priority: 5,
  percentComplete: 0,
  bucketId: 'B-1',
  appliedCategories: {},
  assignments: {},
  dueDateTime: null,
  startDateTime: null,
  conversationThreadId: null,
};

function makeGraphTask(overrides: Record<string, unknown>) {
  return {
    id: EXTERNAL_TASK_ID,
    planId: EXTERNAL_PLAN_ID,
    bucketId: 'B-1',
    title: 'Old Title',
    orderHint: ' !',
    percentComplete: 0,
    priority: 5,
    dueDateTime: null,
    startDateTime: null,
    appliedCategories: {},
    assignments: {},
    ...overrides,
  };
}

describe('plan push: task 412 recover', () => {
  it('refreshes etag on 412 and retries successfully when remote did not touch the same field', async () => {
    const { planLinkRepo, etagRepo, seedTaskEtag, getTaskEtag } = inMemoryRepos();
    seedTaskEtag({ etag: 'W/"stale"', lastSyncedFields: SEED_SYNCED });

    const { graph, log } = buildFakeGraph({
      responses: {
        'PATCH /planner/tasks/T-EXT-1': [
          { status: 412 },
          {
            status: 200,
            body: makeGraphTask({ title: 'Updated Title', '@odata.etag': 'W/"after-retry"' }),
          },
        ],
        // refresh path uses listTasks
        'GET /planner/plans/P-EXT-1/tasks': [
          {
            status: 200,
            body: {
              value: [makeGraphTask({ title: 'Old Title', '@odata.etag': 'W/"fresh"' })],
            },
          },
        ],
      },
    });
    const planner = buildPlannerPushMocks({ task: { title: 'Updated Title' } });
    const emit = vi.fn().mockResolvedValue(undefined);
    const deps = buildPushDeps({ graph, planLinkRepo, etagRepo, planner });
    deps.emit = emit;

    await runPlanPush(
      {
        tenant_id: TENANT_ID,
        plan_id: PLAN_ID,
        resource_type: 'task',
        seta_id: TASK_ID,
        changed_fields: ['title'],
      },
      deps,
    );

    // expect: 1 failing PATCH, 1 GET refresh, 1 successful PATCH
    const calls = log.map((c) => `${c.method} ${c.path}`);
    expect(calls).toEqual([
      'PATCH /planner/tasks/T-EXT-1',
      'GET /planner/plans/P-EXT-1/tasks',
      'PATCH /planner/tasks/T-EXT-1',
    ]);
    // retry If-Match must use refreshed etag
    expect(log[2]?.headers['If-Match']).toBe('W/"fresh"');
    expect(getTaskEtag()?.etag).toBe('W/"after-retry"');
    expect(emit).not.toHaveBeenCalled();
    expect(planner.markPlanSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'idle' }),
    );
  });
});

describe('plan push: task 412 actual conflict', () => {
  it('emits field-conflict when remote also changed the same field', async () => {
    const { planLinkRepo, etagRepo, seedTaskEtag } = inMemoryRepos();
    seedTaskEtag({ etag: 'W/"stale"', lastSyncedFields: SEED_SYNCED });

    const { graph, log } = buildFakeGraph({
      responses: {
        'PATCH /planner/tasks/T-EXT-1': [{ status: 412 }],
        'GET /planner/plans/P-EXT-1/tasks': [
          {
            status: 200,
            body: {
              value: [makeGraphTask({ title: 'Remote Title', '@odata.etag': 'W/"remote-fresh"' })],
            },
          },
        ],
      },
    });
    const planner = buildPlannerPushMocks({ task: { title: 'Local Title' } });
    const emit = vi.fn().mockResolvedValue(undefined);
    const deps = buildPushDeps({ graph, planLinkRepo, etagRepo, planner });
    deps.emit = emit;

    await runPlanPush(
      {
        tenant_id: TENANT_ID,
        plan_id: PLAN_ID,
        resource_type: 'task',
        seta_id: TASK_ID,
        changed_fields: ['title'],
      },
      deps,
    );

    expect(log.map((c) => `${c.method} ${c.path}`)).toEqual([
      'PATCH /planner/tasks/T-EXT-1',
      'GET /planner/plans/P-EXT-1/tasks',
    ]);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'integrations.m365.task.field-conflict',
        payload: expect.objectContaining({
          tenant_id: TENANT_ID,
          plan_id: PLAN_ID,
          seta_id: TASK_ID,
          conflicts: [
            expect.objectContaining({
              field: 'title',
              local: 'Local Title',
              remote: 'Remote Title',
              snapshot: 'Old Title',
            }),
          ],
        }),
      }),
    );
    expect(planner.markTaskSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: TASK_ID, status: 'conflict' }),
    );
    expect(planner.markPlanSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'conflict' }),
    );
  });
});

describe('plan push: 403 limit code', () => {
  it('maps Planner MaximumTasksInProject to a human last_error, no retry', async () => {
    const { planLinkRepo, etagRepo, seedTaskEtag } = inMemoryRepos();
    seedTaskEtag({ etag: 'W/"old"', lastSyncedFields: SEED_SYNCED });

    const { graph, log } = buildFakeGraph({
      responses: {
        'PATCH /planner/tasks/T-EXT-1': [{ status: 403, body: { code: 'MaximumTasksInProject' } }],
      },
    });
    const planner = buildPlannerPushMocks({ task: { title: 'Updated Title' } });
    const deps = buildPushDeps({ graph, planLinkRepo, etagRepo, planner });

    await runPlanPush(
      {
        tenant_id: TENANT_ID,
        plan_id: PLAN_ID,
        resource_type: 'task',
        seta_id: TASK_ID,
        changed_fields: ['title'],
      },
      deps,
    );

    expect(log).toHaveLength(1);
    expect(planner.markPlanSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'error',
        last_error: 'This M365 Planner plan is at its task limit.',
      }),
    );
  });
});
