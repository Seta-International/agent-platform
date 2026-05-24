import { describe, expect, it, vi } from 'vitest';
import { runPlanPull } from '../../src/backend/m365/jobs/plan-pull.ts';
import noChangesFixture from '../../src/backend/m365/plans/__fixtures__/incremental-walk-no-changes.json' with {
  type: 'json',
};
import initialFixture from '../../src/backend/m365/plans/__fixtures__/initial-pull-plan-with-2-buckets-4-tasks.json' with {
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

// Local state that matches what the initial pull would produce
const POST_FIRST_RUN_LOCAL_STATE = {
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

describe('runPlanPull — idempotency across two runs', () => {
  it('second run on unchanged remote state issues 4 graph requests and writes nothing', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const groupLinkRepo = createM365GroupLinkRepo({ db });
      await groupLinkRepo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_ID,
        externalId: 'G-EXT-1',
        lastSyncedFields: {},
      });

      const planLinkRepo = createM365PlanLinkRepo({ db });
      await planLinkRepo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_ID,
        planId: PLAN_ID,
        externalId: EXTERNAL_PLAN_ID,
        initialSnapshot: {},
      });

      const etagRepo = createM365ResourceEtagRepo({ db });

      // --- First run: initial full pull ---
      const { graph: graph1, requestPaths: requestPaths1 } = buildStubGraph(
        initialFixture as Record<string, unknown>,
      );
      const planner1 = buildPlannerMocks({
        planTitle: '',
        categoryDescriptions: {},
        buckets: [],
        tasks: [],
      });
      const deps1 = buildDeps(graph1, planLinkRepo, etagRepo, planner1);

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: true }, deps1);

      // Verify first run: 2 buckets, 4 tasks, 1 setCategoryDescriptions
      expect(planner1.createBucket).toHaveBeenCalledTimes(2);
      expect(planner1.createTask).toHaveBeenCalledTimes(4);
      expect(planner1.setCategoryDescriptions).toHaveBeenCalledTimes(1);
      // 12 graph requests: 4 listing + (details + boardFormat) per 4 tasks
      expect(requestPaths1).toHaveLength(12);

      // 16 etag rows after first run
      const etagRowsAfterRun1 = await etagRepo.listForLink(
        (await planLinkRepo.findByPlan(PLAN_ID))!.id,
      );
      expect(etagRowsAfterRun1).toHaveLength(16);

      // --- Second run: incremental with no changes ---
      // Use no-changes fixture: same etags as what the first run persisted.
      // Planner mocks return the post-first-run state so the walker sees everything already synced.
      const { graph: graph2, requestPaths: requestPaths2 } = buildStubGraph(
        noChangesFixture as Record<string, unknown>,
      );
      const planner2 = buildPlannerMocks(POST_FIRST_RUN_LOCAL_STATE);
      const deps2 = buildDeps(graph2, planLinkRepo, etagRepo, planner2);

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps2);

      // Exactly 4 graph requests on the second run: plan, planDetails, buckets, tasks only
      expect(requestPaths2).toHaveLength(4);

      // No planner writes on the second run
      expect(planner2.createBucket).toHaveBeenCalledTimes(0);
      expect(planner2.updateBucket).toHaveBeenCalledTimes(0);
      expect(planner2.deleteBucket).toHaveBeenCalledTimes(0);
      expect(planner2.createTask).toHaveBeenCalledTimes(0);
      expect(planner2.updateTask).toHaveBeenCalledTimes(0);
      expect(planner2.deleteTask).toHaveBeenCalledTimes(0);
      expect(planner2.setCategoryDescriptions).toHaveBeenCalledTimes(0);
      expect(planner2.createLabel).toHaveBeenCalledTimes(0);

      // Status transitions on second run: pulling → idle
      const statusCalls = vi.mocked(planner2.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      expect(statusCalls).toHaveLength(2);
      expect(statusCalls[0]).toMatchObject({ plan_id: PLAN_ID, status: 'pulling' });
      expect(statusCalls[1]).toMatchObject({ plan_id: PLAN_ID, status: 'idle' });

      // Etag row count unchanged at 16 after second run
      const etagRowsAfterRun2 = await etagRepo.listForLink(
        (await planLinkRepo.findByPlan(PLAN_ID))!.id,
      );
      expect(etagRowsAfterRun2).toHaveLength(16);
    });
  });
});
