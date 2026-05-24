import { describe, expect, it, vi } from 'vitest';
import { runPlanPull } from '../../src/backend/m365/jobs/plan-pull.ts';
import fixture from '../../src/backend/m365/plans/__fixtures__/incremental-walk-no-changes.json' with {
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

const FULLY_SYNCED_LOCAL_STATE = {
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

describe('runPlanPull — incremental walk, steady state (no changes)', () => {
  it('issues exactly 4 graph requests and writes nothing when all etags match', async () => {
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
        initialSnapshot: {
          plan: { title: 'Roadmap' },
          categoryDescriptions: { category1: 'Urgent', category3: 'Bug' },
        },
      });

      const etagRepo = createM365ResourceEtagRepo({ db });

      // Pre-seed all 16 etag rows matching the fixture etag values.
      // plan + planDetails
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

      // buckets
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

      // tasks
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

      const { graph, requestPaths } = buildStubGraph(fixture as Record<string, unknown>);
      const planner = buildPlannerMocks(FULLY_SYNCED_LOCAL_STATE);
      const deps = buildDeps(graph, planLinkRepo, etagRepo, planner);

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps);

      // Exactly 4 graph requests: plan, planDetails, buckets, tasks — no /details or /boardFormat
      expect(requestPaths).toHaveLength(4);
      expect(requestPaths).toContain('/planner/plans/P-EXT-1');
      expect(requestPaths).toContain('/planner/plans/P-EXT-1/details');
      expect(requestPaths).toContain('/planner/plans/P-EXT-1/buckets');
      expect(requestPaths).toContain('/planner/plans/P-EXT-1/tasks');

      // No planner writes
      expect(planner.createBucket).toHaveBeenCalledTimes(0);
      expect(planner.updateBucket).toHaveBeenCalledTimes(0);
      expect(planner.deleteBucket).toHaveBeenCalledTimes(0);
      expect(planner.createTask).toHaveBeenCalledTimes(0);
      expect(planner.updateTask).toHaveBeenCalledTimes(0);
      expect(planner.deleteTask).toHaveBeenCalledTimes(0);
      expect(planner.setTaskAssignees).toHaveBeenCalledTimes(0);
      expect(planner.updateTaskDetails).toHaveBeenCalledTimes(0);
      expect(planner.setCategoryDescriptions).toHaveBeenCalledTimes(0);
      expect(planner.createLabel).toHaveBeenCalledTimes(0);

      // Status transitions: pulling → idle
      expect(planner.markPlanSyncStatus).toHaveBeenCalledTimes(2);
      const statusCalls = vi.mocked(planner.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      expect(statusCalls[0]).toMatchObject({ plan_id: PLAN_ID, status: 'pulling' });
      expect(statusCalls[1]).toMatchObject({ plan_id: PLAN_ID, status: 'idle' });

      // Etag row count unchanged: still 16
      const etagRows = await etagRepo.listForLink(link.id);
      expect(etagRows).toHaveLength(16);

      // Snapshot unchanged for plan/categoryDescriptions; tasks map empty since no changed tasks
      const refreshedLink = await planLinkRepo.findByPlan(PLAN_ID);
      expect(refreshedLink).not.toBeNull();
      expect(refreshedLink!.lastSyncedSnapshot).toEqual({
        plan: { title: 'Roadmap' },
        categoryDescriptions: { category1: 'Urgent', category3: 'Bug' },
        tasks: {},
      });
    });
  });
});
