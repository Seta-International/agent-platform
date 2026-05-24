import { describe, expect, it, vi } from 'vitest';
import { runPlanPull } from '../../src/backend/m365/jobs/plan-pull.ts';
import planTitleConflictFixture from '../../src/backend/m365/plans/__fixtures__/incremental-walk-with-plan-title-conflict.json' with {
  type: 'json',
};
import conflictFixture from '../../src/backend/m365/plans/__fixtures__/incremental-walk-with-task-title-conflict.json' with {
  type: 'json',
};
import remoteWinsFixture from '../../src/backend/m365/plans/__fixtures__/incremental-walk-with-task-title-remote-wins.json' with {
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

// Local state where T1 has been edited locally to 'LocalEdit' (diverged from snapshot 'Original')
const LOCAL_STATE_WITH_T1_DIVERGED = {
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
      title: 'LocalEdit',
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

// Local state where T1 title matches the snapshot 'Same' (remote will advance to 'Updated')
const LOCAL_STATE_WITH_T1_SAME_AS_SNAPSHOT = {
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
      title: 'Same',
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

async function seedBaseState(
  db: Parameters<Parameters<typeof withIntegrationsTestDb>[0]>[0]['db'],
  snapshotTasks: Record<string, { title?: string }>,
  snapshotPlanTitle = 'Roadmap',
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
      plan: { title: snapshotPlanTitle },
      categoryDescriptions: { category1: 'Urgent', category3: 'Bug' },
      tasks: snapshotTasks,
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

  for (const { setaId, extId, etag } of [
    { setaId: 'BUCKET-LOCAL-1', extId: 'B-EXT-1', etag: 'W/"b1-v1"' },
    { setaId: 'BUCKET-LOCAL-2', extId: 'B-EXT-2', etag: 'W/"b2-v1"' },
  ]) {
    await etagRepo.upsert({
      tenantId: TENANT_ID,
      planLinkId: link.id,
      resourceType: 'bucket',
      setaId,
      externalId: extId,
      etag,
      lastSyncedFields: {},
    });
  }

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
    await etagRepo.upsert({
      tenantId: TENANT_ID,
      planLinkId: link.id,
      resourceType: 'taskDetails',
      setaId,
      externalId: extId.replace('T-EXT-', 'TD-EXT-'),
      etag: etag.replace('t', 'td'),
      lastSyncedFields: {},
    });
    await etagRepo.upsert({
      tenantId: TENANT_ID,
      planLinkId: link.id,
      resourceType: 'bucketTaskBoardTaskFormat',
      setaId,
      externalId: extId.replace('T-EXT-', 'BTBF-EXT-'),
      etag: etag.replace('t', 'btbf'),
      lastSyncedFields: {},
    });
  }

  return { planLinkRepo, etagRepo, link };
}

describe('runPlanPull — per-field LWW: conflict path', () => {
  it('emits field-conflict event, marks task conflict, excludes conflicting field from patch, ends plan status as conflict', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      // snapshot.tasks['T-EXT-1'].title = 'Original'
      // local T1.title = 'LocalEdit'   (diverged from snapshot)
      // remote T1.title = 'RemoteEdit' (also diverged from snapshot)
      // → LWW decision: conflict
      const { planLinkRepo, etagRepo } = await seedBaseState(db, {
        'T-EXT-1': { title: 'Original' },
      });

      const { graph, requestPaths } = buildStubGraph(conflictFixture as Record<string, unknown>);
      const planner = buildPlannerMocks(LOCAL_STATE_WITH_T1_DIVERGED);
      const deps = buildDeps(graph, planLinkRepo, etagRepo, planner);

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps);

      // Only T-EXT-1 changed (advanced etag); T2/T3/T4 unchanged → only T1 details fetched
      expect(requestPaths).toContain('/planner/tasks/T-EXT-1/details');
      expect(requestPaths).toContain('/planner/tasks/T-EXT-1/bucketTaskBoardFormat');
      expect(requestPaths).not.toContain('/planner/tasks/T-EXT-2/details');

      // conflict event emitted for T1 with the title conflict
      expect(deps.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'integrations.m365.task.field-conflict',
          payload: expect.objectContaining({
            tenant_id: TENANT_ID,
            plan_id: PLAN_ID,
            task_id: 'TASK-LOCAL-1',
            external_task_id: 'T-EXT-1',
            conflicts: expect.arrayContaining([
              expect.objectContaining({
                field: 'title',
                local: 'LocalEdit',
                remote: 'RemoteEdit',
                snapshot: 'Original',
              }),
            ]),
          }),
        }),
      );

      // markTaskSyncStatus called with 'conflict' for T1
      expect(planner.markTaskSyncStatus).toHaveBeenCalledWith(
        expect.objectContaining({ task_id: 'TASK-LOCAL-1', status: 'conflict' }),
      );

      // updateTask for T1 was called but patch does NOT contain title (conflict excluded)
      const updateCalls = vi.mocked(planner.updateTask).mock.calls.map((c) => c[0]);
      const t1Update = updateCalls.find((c) => c.task_id === 'TASK-LOCAL-1');
      expect(t1Update).toBeDefined();
      expect(t1Update!.patch).not.toHaveProperty('title');
      // etag still advances on the row
      expect(t1Update!.patch.external_etag).toBe('W/"t1-v2"');

      // plan status ends as 'conflict' (not 'idle') because T1 had a conflict
      const statusCalls = vi.mocked(planner.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      const finalStatus = statusCalls[statusCalls.length - 1];
      expect(finalStatus).toMatchObject({ plan_id: PLAN_ID, status: 'conflict' });

      // etag row for T1 (task) still advanced to the new etag
      const etagRows = await etagRepo.listForLink(
        (await planLinkRepo.findByPlan(PLAN_ID))!.id,
        'task',
      );
      const t1EtagRow = etagRows.find((r) => r.externalId === 'T-EXT-1');
      expect(t1EtagRow?.etag).toBe('W/"t1-v2"');
    });
  });
});

describe('runPlanPull — per-field LWW: remote-wins happy path', () => {
  it('applies remote title update without conflict when local matches snapshot', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      // snapshot.tasks['T-EXT-1'].title = 'Same'
      // local T1.title = 'Same'    (matches snapshot — no local edit)
      // remote T1.title = 'Updated' (remote changed it)
      // → LWW decision: remote-wins → patch includes title: 'Updated'
      const { planLinkRepo, etagRepo } = await seedBaseState(db, {
        'T-EXT-1': { title: 'Same' },
      });

      const { graph } = buildStubGraph(remoteWinsFixture as Record<string, unknown>);
      const planner = buildPlannerMocks(LOCAL_STATE_WITH_T1_SAME_AS_SNAPSHOT);
      const deps = buildDeps(graph, planLinkRepo, etagRepo, planner);

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps);

      // no conflict event emitted
      const emitCalls = vi.mocked(deps.emit).mock.calls;
      const conflictEmits = emitCalls.filter(
        (c) => c[0]?.type === 'integrations.m365.task.field-conflict',
      );
      expect(conflictEmits).toHaveLength(0);

      // markTaskSyncStatus called with 'idle' for T1
      expect(planner.markTaskSyncStatus).toHaveBeenCalledWith(
        expect.objectContaining({ task_id: 'TASK-LOCAL-1', status: 'idle' }),
      );

      // updateTask patch includes title: 'Updated'
      const updateCalls = vi.mocked(planner.updateTask).mock.calls.map((c) => c[0]);
      const t1Update = updateCalls.find((c) => c.task_id === 'TASK-LOCAL-1');
      expect(t1Update).toBeDefined();
      expect(t1Update!.patch.title).toBe('Updated');

      // plan status ends as 'idle'
      const statusCalls = vi.mocked(planner.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      const finalStatus = statusCalls[statusCalls.length - 1];
      expect(finalStatus).toMatchObject({ plan_id: PLAN_ID, status: 'idle' });
    });
  });
});

describe('runPlanPull — plan-level field conflict', () => {
  it('emits plan.field-conflict event and ends plan status as conflict when plan title diverges on both sides', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      // snapshot.plan.title = 'A'
      // local.plan.title = 'B'   (diverged from snapshot)
      // remote.plan.title = 'C'  (also diverged from snapshot)
      // → LWW decision: conflict → emits plan.field-conflict, no updatePlan call, plan status = conflict
      const { planLinkRepo, etagRepo } = await seedBaseState(db, {}, 'A');

      const LOCAL_STATE_WITH_PLAN_TITLE_B = {
        planTitle: 'B',
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

      const { graph } = buildStubGraph(planTitleConflictFixture as Record<string, unknown>);
      const planner = buildPlannerMocks(LOCAL_STATE_WITH_PLAN_TITLE_B);
      const deps = buildDeps(graph, planLinkRepo, etagRepo, planner);

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps);

      // plan.field-conflict event emitted with the title conflict
      expect(deps.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'integrations.m365.plan.field-conflict',
          payload: expect.objectContaining({
            tenant_id: TENANT_ID,
            plan_id: PLAN_ID,
            conflicts: expect.arrayContaining([
              expect.objectContaining({
                scope: 'plan',
                field: 'title',
                local: 'B',
                remote: 'C',
                snapshot: 'A',
              }),
            ]),
          }),
        }),
      );

      // updatePlan NOT called (conflict — title not applied)
      expect(planner.updatePlan).not.toHaveBeenCalled();

      // plan status ends as 'conflict'
      const statusCalls = vi.mocked(planner.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      const finalStatus = statusCalls[statusCalls.length - 1];
      expect(finalStatus).toMatchObject({ plan_id: PLAN_ID, status: 'conflict' });
    });
  });
});
