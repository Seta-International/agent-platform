import { describe, expect, it, vi } from 'vitest';
import { runPlanPull } from '../../src/backend/m365/jobs/plan-pull.ts';
import reorderFixture from '../../src/backend/m365/plans/__fixtures__/incremental-walk-bucket-reorder.json' with {
  type: 'json',
};
import {
  createM365PlanLinkRepo,
  createM365ResourceEtagRepo,
} from '../../src/backend/m365/plans/repo.ts';
import { createM365GroupLinkRepo } from '../../src/backend/m365/repo.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';
import {
  buildDeps,
  buildPlannerMocks,
  buildStubGraph,
  EXTERNAL_PLAN_ID,
  GROUP_ID,
  PLAN_ID,
  TENANT_ID,
} from './_plan-pull-helpers.ts';

// Local state: 2 buckets and 4 tasks fully synced at their v1 etags, BEFORE the reorder.
// B-EXT-2 has its original orderHint '9090909090' matching the stored etag 'W/"b2-v1"'.
const PRE_REORDER_LOCAL_STATE = {
  planTitle: 'Roadmap',
  categoryDescriptions: { category1: 'Urgent', category3: 'Bug' },
  buckets: [
    { id: 'BUCKET-LOCAL-1', name: 'To Do', order_hint: '8585858585', external_id: 'B-EXT-1' },
    { id: 'BUCKET-LOCAL-2', name: 'Doing', order_hint: '9090909090', external_id: 'B-EXT-2' },
  ],
  tasks: [
    {
      id: 'TASK-LOCAL-1',
      bucket_id: 'BUCKET-LOCAL-1',
      title: 'Task 1',
      external_id: 'T-EXT-1',
      external_etag: 'W/"t1-v1"',
    },
    {
      id: 'TASK-LOCAL-2',
      bucket_id: 'BUCKET-LOCAL-1',
      title: 'Task 2',
      external_id: 'T-EXT-2',
      external_etag: 'W/"t2-v1"',
    },
    {
      id: 'TASK-LOCAL-3',
      bucket_id: 'BUCKET-LOCAL-2',
      title: 'Task 3',
      external_id: 'T-EXT-3',
      external_etag: 'W/"t3-v1"',
    },
    {
      id: 'TASK-LOCAL-4',
      bucket_id: 'BUCKET-LOCAL-2',
      title: 'Task 4',
      external_id: 'T-EXT-4',
      external_etag: 'W/"t4-v1"',
    },
  ],
};

// After the reorder, B2 has the new orderHint and etag.
const POST_REORDER_LOCAL_STATE = {
  ...PRE_REORDER_LOCAL_STATE,
  buckets: [
    { id: 'BUCKET-LOCAL-1', name: 'To Do', order_hint: '8585858585', external_id: 'B-EXT-1' },
    { id: 'BUCKET-LOCAL-2', name: 'Doing', order_hint: '7777777777', external_id: 'B-EXT-2' },
  ],
};

async function seedFullSyncedState(
  db: Parameters<Parameters<typeof withIntegrationsTestDb>[0]>[0]['db'],
) {
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
    initialSnapshot: {
      plan: { title: 'Roadmap' },
      categoryDescriptions: { category1: 'Urgent', category3: 'Bug' },
    },
  });

  const etagRepo = createM365ResourceEtagRepo({ db });

  await etagRepo.upsert({
    tenantId: TENANT_ID,
    planLinkId: link.id,
    resourceType: 'plan',
    setaId: PLAN_ID,
    externalId: EXTERNAL_PLAN_ID,
    etag: 'W/"plan-v1"',
    lastSyncedFields: { title: 'Roadmap' },
  });
  await etagRepo.upsert({
    tenantId: TENANT_ID,
    planLinkId: link.id,
    resourceType: 'planDetails',
    setaId: PLAN_ID,
    externalId: 'PD-EXT-1',
    etag: 'W/"pd-v1"',
    lastSyncedFields: { categoryDescriptions: { category1: 'Urgent', category3: 'Bug' } },
  });

  // Buckets: B1 at v1, B2 at v1 (pre-reorder)
  await etagRepo.upsert({
    tenantId: TENANT_ID,
    planLinkId: link.id,
    resourceType: 'bucket',
    setaId: 'BUCKET-LOCAL-1',
    externalId: 'B-EXT-1',
    etag: 'W/"b1-v1"',
    lastSyncedFields: { name: 'To Do', order_hint: '8585858585' },
  });
  await etagRepo.upsert({
    tenantId: TENANT_ID,
    planLinkId: link.id,
    resourceType: 'bucket',
    setaId: 'BUCKET-LOCAL-2',
    externalId: 'B-EXT-2',
    etag: 'W/"b2-v1"',
    lastSyncedFields: { name: 'Doing', order_hint: '9090909090' },
  });

  // Tasks
  for (const { setaId, extId, etag } of [
    { setaId: 'TASK-LOCAL-1', extId: 'T-EXT-1', etag: 'W/"t1-v1"' },
    { setaId: 'TASK-LOCAL-2', extId: 'T-EXT-2', etag: 'W/"t2-v1"' },
    { setaId: 'TASK-LOCAL-3', extId: 'T-EXT-3', etag: 'W/"t3-v1"' },
    { setaId: 'TASK-LOCAL-4', extId: 'T-EXT-4', etag: 'W/"t4-v1"' },
  ]) {
    await etagRepo.upsert({
      tenantId: TENANT_ID,
      planLinkId: link.id,
      resourceType: 'task',
      setaId,
      externalId: extId,
      etag,
      lastSyncedFields: {},
    });
  }

  // taskDetails
  for (const { setaId, extId, etag } of [
    { setaId: 'TASK-LOCAL-1', extId: 'TD-EXT-1', etag: 'W/"td1-v1"' },
    { setaId: 'TASK-LOCAL-2', extId: 'TD-EXT-2', etag: 'W/"td2-v1"' },
    { setaId: 'TASK-LOCAL-3', extId: 'TD-EXT-3', etag: 'W/"td3-v1"' },
    { setaId: 'TASK-LOCAL-4', extId: 'TD-EXT-4', etag: 'W/"td4-v1"' },
  ]) {
    await etagRepo.upsert({
      tenantId: TENANT_ID,
      planLinkId: link.id,
      resourceType: 'taskDetails',
      setaId,
      externalId: extId,
      etag,
      lastSyncedFields: {},
    });
  }

  // bucketTaskBoardTaskFormat
  for (const { setaId, extId, etag } of [
    { setaId: 'TASK-LOCAL-1', extId: 'BTBF-EXT-1', etag: 'W/"btbf1-v1"' },
    { setaId: 'TASK-LOCAL-2', extId: 'BTBF-EXT-2', etag: 'W/"btbf2-v1"' },
    { setaId: 'TASK-LOCAL-3', extId: 'BTBF-EXT-3', etag: 'W/"btbf3-v1"' },
    { setaId: 'TASK-LOCAL-4', extId: 'BTBF-EXT-4', etag: 'W/"btbf4-v1"' },
  ]) {
    await etagRepo.upsert({
      tenantId: TENANT_ID,
      planLinkId: link.id,
      resourceType: 'bucketTaskBoardTaskFormat',
      setaId,
      externalId: extId,
      etag,
      lastSyncedFields: {},
    });
  }

  return { planLinkRepo, etagRepo, link };
}

describe('runPlanPull — bucket reorder (orderHint advance)', () => {
  it('calls updateBucket exactly once for the reordered bucket and touches no tasks', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const { planLinkRepo, etagRepo, link } = await seedFullSyncedState(db);

      const { graph, requestPaths } = buildStubGraph(reorderFixture as Record<string, unknown>);
      const planner = buildPlannerMocks(PRE_REORDER_LOCAL_STATE);
      const deps = buildDeps(graph, planLinkRepo, etagRepo, planner);

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps);

      // Only 4 graph requests: plan, planDetails, buckets, tasks (no task details fetched)
      expect(requestPaths).toHaveLength(4);

      // Only B2 updated; B1 untouched
      expect(planner.updateBucket).toHaveBeenCalledTimes(1);
      const updateBucketCall = vi.mocked(planner.updateBucket).mock.calls[0]![0];
      expect(updateBucketCall.bucket_id).toBe('BUCKET-LOCAL-2');
      expect(updateBucketCall.patch).toMatchObject({
        name: 'Doing',
        order_hint: '7777777777',
        external_etag: 'W/"b2-v2"',
      });

      // No task writes
      expect(planner.createTask).toHaveBeenCalledTimes(0);
      expect(planner.updateTask).toHaveBeenCalledTimes(0);
      expect(planner.deleteTask).toHaveBeenCalledTimes(0);
      expect(planner.createBucket).toHaveBeenCalledTimes(0);
      expect(planner.deleteBucket).toHaveBeenCalledTimes(0);
      expect(planner.setCategoryDescriptions).toHaveBeenCalledTimes(0);

      // Status: pulling → idle
      const statusCalls = vi.mocked(planner.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      expect(statusCalls[0]).toMatchObject({ plan_id: PLAN_ID, status: 'pulling' });
      expect(statusCalls[statusCalls.length - 1]).toMatchObject({
        plan_id: PLAN_ID,
        status: 'idle',
      });

      // B2 etag updated in DB
      const etagRows = await etagRepo.listForLink(link.id);
      const b2EtagRow = etagRows.find(
        (r) => r.resourceType === 'bucket' && r.externalId === 'B-EXT-2',
      );
      expect(b2EtagRow).toBeDefined();
      expect(b2EtagRow!.etag).toBe('W/"b2-v2"');

      // Total etag row count unchanged at 16
      expect(etagRows).toHaveLength(16);

      // --- Second run: same reorder fixture — now the etag is already stored, so no-op ---
      const { graph: graph2, requestPaths: requestPaths2 } = buildStubGraph(
        reorderFixture as Record<string, unknown>,
      );
      const planner2 = buildPlannerMocks(POST_REORDER_LOCAL_STATE);
      const deps2 = buildDeps(graph2, planLinkRepo, etagRepo, planner2);

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps2);

      // Still only 4 graph requests
      expect(requestPaths2).toHaveLength(4);

      // No bucket writes on second run (idempotent)
      expect(planner2.updateBucket).toHaveBeenCalledTimes(0);
      expect(planner2.createBucket).toHaveBeenCalledTimes(0);
      expect(planner2.deleteBucket).toHaveBeenCalledTimes(0);
      expect(planner2.createTask).toHaveBeenCalledTimes(0);
      expect(planner2.updateTask).toHaveBeenCalledTimes(0);
      expect(planner2.deleteTask).toHaveBeenCalledTimes(0);
    });
  });
});
