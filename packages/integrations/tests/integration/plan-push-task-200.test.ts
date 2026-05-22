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

describe('plan push: task PATCH happy path', () => {
  it('PATCHes /tasks/<id> with If-Match + Prefer headers and persists the new etag', async () => {
    const { planLinkRepo, etagRepo, seedTaskEtag, getTaskEtag } = inMemoryRepos();
    seedTaskEtag({
      etag: 'W/"old"',
      lastSyncedFields: {
        title: 'Old Title',
        priority: 5,
        percentComplete: 0,
        bucketId: 'B-1',
        appliedCategories: {},
        assignments: {},
        dueDateTime: null,
        startDateTime: null,
        conversationThreadId: null,
      },
    });
    const { graph, log } = buildFakeGraph({
      responses: {
        'PATCH /planner/tasks/T-EXT-1': [
          {
            status: 200,
            body: {
              id: EXTERNAL_TASK_ID,
              '@odata.etag': 'W/"new"',
              planId: EXTERNAL_PLAN_ID,
              bucketId: 'B-1',
              title: 'Updated Title',
              orderHint: ' !',
              percentComplete: 0,
              priority: 5,
              dueDateTime: null,
              startDateTime: null,
              appliedCategories: {},
              assignments: {},
            },
          },
        ],
      },
    });
    const planner = buildPlannerPushMocks({
      task: { title: 'Updated Title', '@odata.etag': 'unused' },
    });
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

    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      method: 'PATCH',
      path: `/planner/tasks/${EXTERNAL_TASK_ID}`,
      body: { title: 'Updated Title' },
    });
    expect(log[0]?.headers).toMatchObject({
      'If-Match': 'W/"old"',
      Prefer: 'return=representation',
    });
    expect(getTaskEtag()?.etag).toBe('W/"new"');
    expect(planner.markPlanSyncStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pushing' }),
    );
    expect(planner.markPlanSyncStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'idle' }),
    );
    expect(planner.updateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        task_id: TASK_ID,
        patch: expect.objectContaining({ external_etag: 'W/"new"' }),
      }),
    );
    expect(emit).not.toHaveBeenCalled();
  });
});
