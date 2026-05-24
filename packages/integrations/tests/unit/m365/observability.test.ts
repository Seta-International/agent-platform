import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPlanPull } from '../../../src/backend/m365/jobs/plan-pull.ts';
import {
  assigneeSkippedCounter,
  planPullSuccessCounter,
} from '../../../src/backend/m365/observability.ts';
import noChangesFixture from '../../../src/backend/m365/plans/__fixtures__/incremental-walk-no-changes.json' with {
  type: 'json',
};
import initialFixture from '../../../src/backend/m365/plans/__fixtures__/initial-pull-plan-with-2-buckets-4-tasks.json' with {
  type: 'json',
};
import { createAssigneeResolver } from '../../../src/backend/m365/plans/assignee-resolver.ts';
import {
  createM365PlanLinkRepo,
  createM365ResourceEtagRepo,
} from '../../../src/backend/m365/plans/repo.ts';
import { createM365GroupLinkRepo } from '../../../src/backend/m365/repo.ts';
import { withIntegrationsTestDb } from '../../helpers/test-db.ts';
import {
  buildDeps,
  buildPlannerMocks,
  buildStubGraph,
  PLAN_ID,
  TENANT_ID,
} from '../../integration/_plan-pull-helpers.ts';

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

const GROUP_ID = '22222222-2222-2222-2222-222222222222';
const EXTERNAL_PLAN_ID = 'P-EXT-1';

describe('observability counters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runPlanPull success increments planPullSuccessCounter', async () => {
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

      // First run to populate etag rows so the second run sees no changes.
      const { graph: graph1 } = buildStubGraph(initialFixture as Record<string, unknown>);
      const planner1 = buildPlannerMocks({
        planTitle: '',
        categoryDescriptions: {},
        buckets: [],
        tasks: [],
      });
      const deps1 = buildDeps(graph1, planLinkRepo, etagRepo, planner1);
      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: true }, deps1);

      // Second run: no changes — spy only on this run.
      const { graph: graph2 } = buildStubGraph(noChangesFixture as Record<string, unknown>);
      const planner2 = buildPlannerMocks(POST_FIRST_RUN_LOCAL_STATE);
      const deps2 = buildDeps(graph2, planLinkRepo, etagRepo, planner2);

      const spy = vi.spyOn(planPullSuccessCounter, 'add');

      await runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps2);

      expect(spy).toHaveBeenCalledOnce();
      expect(spy).toHaveBeenCalledWith(1, { tenant_id: TENANT_ID });
    });
  });

  it('assignee resolver increments assigneeSkippedCounter on skip', async () => {
    const findUserByEntraOid = vi.fn(async () => null);
    const emit = vi.fn();
    const resolver = createAssigneeResolver({ findUserByEntraOid, emit });

    const spy = vi.spyOn(assigneeSkippedCounter, 'add');

    await resolver.resolveMany(['OID-1'], { tenantId: 'T', planId: 'P', taskId: 'TASK1' });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(1, { tenant_id: 'T' });
  });
});
