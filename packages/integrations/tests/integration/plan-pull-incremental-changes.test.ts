import { describe, expect, it, vi } from 'vitest';
import { runPlanPull } from '../../src/backend/m365/jobs/plan-pull.ts';
import fixture from '../../src/backend/m365/plans/__fixtures__/incremental-walk-with-3-updates-and-1-deletion.json' with {
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

describe('runPlanPull — incremental walk, 3 updated tasks + 1 deletion', () => {
  it('issues 10 graph requests, updates T1-T3, deletes T4, and drops 3 etag rows', async () => {
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

      // Pre-seed all 16 etag rows matching the initial (v1) etag values.
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

      // 4 listing + 3 task-details + 3 boardFormat = 10 (T4 is deleted, no details fetched for it)
      expect(requestPaths).toHaveLength(10);
      expect(requestPaths).toContain('/planner/plans/P-EXT-1');
      expect(requestPaths).toContain('/planner/plans/P-EXT-1/details');
      expect(requestPaths).toContain('/planner/plans/P-EXT-1/buckets');
      expect(requestPaths).toContain('/planner/plans/P-EXT-1/tasks');
      expect(requestPaths).toContain('/planner/tasks/T-EXT-1/details');
      expect(requestPaths).toContain('/planner/tasks/T-EXT-1/bucketTaskBoardFormat');
      expect(requestPaths).toContain('/planner/tasks/T-EXT-2/details');
      expect(requestPaths).toContain('/planner/tasks/T-EXT-2/bucketTaskBoardFormat');
      expect(requestPaths).toContain('/planner/tasks/T-EXT-3/details');
      expect(requestPaths).toContain('/planner/tasks/T-EXT-3/bucketTaskBoardFormat');

      // No /details or /boardFormat for T-EXT-4 (it was deleted)
      expect(requestPaths).not.toContain('/planner/tasks/T-EXT-4/details');
      expect(requestPaths).not.toContain('/planner/tasks/T-EXT-4/bucketTaskBoardFormat');

      // updateTask called 3 times for T1, T2, T3 with advanced etag values
      expect(planner.updateTask).toHaveBeenCalledTimes(3);
      const updateTaskCalls = vi.mocked(planner.updateTask).mock.calls.map((c) => c[0]);
      const updatedTaskIds = updateTaskCalls.map((c) => c.task_id).sort();
      expect(updatedTaskIds).toEqual(['TASK-LOCAL-1', 'TASK-LOCAL-2', 'TASK-LOCAL-3']);

      const t1Update = updateTaskCalls.find((c) => c.task_id === 'TASK-LOCAL-1')!;
      expect(t1Update.patch.external_etag).toBe('W/"t1-v2"');
      expect(t1Update.patch.title).toBe('Task 1 — updated');

      const t2Update = updateTaskCalls.find((c) => c.task_id === 'TASK-LOCAL-2')!;
      expect(t2Update.patch.external_etag).toBe('W/"t2-v2"');

      const t3Update = updateTaskCalls.find((c) => c.task_id === 'TASK-LOCAL-3')!;
      expect(t3Update.patch.external_etag).toBe('W/"t3-v2"');
      expect(t3Update.patch.preview_type).toBe('description');

      // deleteTask called once for T4
      expect(planner.deleteTask).toHaveBeenCalledTimes(1);
      const deleteCall = vi.mocked(planner.deleteTask).mock.calls[0]![0];
      expect(deleteCall.task_id).toBe('TASK-LOCAL-4');
      expect(deleteCall.reason).toBe('external_removed');

      // No bucket mutations
      expect(planner.createBucket).toHaveBeenCalledTimes(0);
      expect(planner.updateBucket).toHaveBeenCalledTimes(0);
      expect(planner.deleteBucket).toHaveBeenCalledTimes(0);
      expect(planner.createTask).toHaveBeenCalledTimes(0);

      // setTaskAssignees called once per updated task (3 times)
      expect(planner.setTaskAssignees).toHaveBeenCalledTimes(3);
      const assigneeCalls = vi.mocked(planner.setTaskAssignees).mock.calls.map((c) => c[0]);
      const assigneeTaskIds = assigneeCalls.map((c) => c.task_id).sort();
      expect(assigneeTaskIds).toEqual(['TASK-LOCAL-1', 'TASK-LOCAL-2', 'TASK-LOCAL-3']);

      // updateTaskDetails called 3 times (for T1, T2, T3)
      expect(planner.updateTaskDetails).toHaveBeenCalledTimes(3);
      const detailsCalls = vi.mocked(planner.updateTaskDetails).mock.calls.map((c) => c[0]);
      const detailsTaskIds = detailsCalls.map((c) => c.task_id).sort();
      expect(detailsTaskIds).toEqual(['TASK-LOCAL-1', 'TASK-LOCAL-2', 'TASK-LOCAL-3']);

      // Status transitions: pulling → idle
      expect(planner.markPlanSyncStatus).toHaveBeenCalledTimes(2);
      const statusCalls = vi.mocked(planner.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      expect(statusCalls[0]).toMatchObject({ plan_id: PLAN_ID, status: 'pulling' });
      expect(statusCalls[1]).toMatchObject({ plan_id: PLAN_ID, status: 'idle' });

      // Etag rows: 16 - 3 (T4 task + taskDetails + boardFormat) = 13
      const etagRows = await etagRepo.listForLink(link.id);
      expect(etagRows).toHaveLength(13);

      // T4 etag rows must be gone
      const t4TaskRow = etagRows.find(
        (r) => r.resourceType === 'task' && r.externalId === 'T-EXT-4',
      );
      expect(t4TaskRow).toBeUndefined();

      // T1, T2, T3 task etag rows updated to advanced values
      const taskEtags = etagRows.filter((r) => r.resourceType === 'task');
      expect(taskEtags).toHaveLength(3);
      const taskEtagByExt = Object.fromEntries(taskEtags.map((r) => [r.externalId, r.etag]));
      expect(taskEtagByExt['T-EXT-1']).toBe('W/"t1-v2"');
      expect(taskEtagByExt['T-EXT-2']).toBe('W/"t2-v2"');
      expect(taskEtagByExt['T-EXT-3']).toBe('W/"t3-v2"');
    });
  });
});
