import { describe, expect, it, vi } from 'vitest';
import { runPlanPull } from '../../src/backend/m365/jobs/plan-pull.ts';
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

// Minimal fixture: only getPlan is needed; getPlanDetails/listBuckets/listTasks
// are never reached when getPlan throws.
const MINIMAL_FIXTURE = {
  'GET /planner/plans/P-EXT-1': {
    id: 'P-EXT-1',
    '@odata.etag': 'W/"plan-v1"',
    title: 'Roadmap',
    container: { containerId: 'G-EXT-1', type: 'group' },
  },
};

const EMPTY_LOCAL_STATE = {
  planTitle: '',
  categoryDescriptions: {},
  buckets: [],
  tasks: [],
};

describe('runPlanPull — throttle / 429 error path', () => {
  it('marks plan sync status error and rethrows when Graph throws a 429', async () => {
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

      // Build a stub graph whose getPlan throws a 429-like error (simulating the Graph SDK
      // exhausting its built-in RetryHandler retries and surfacing the error to the caller).
      const throttleError = Object.assign(new Error('Too Many Requests'), {
        statusCode: 429,
        body: { error: { code: 'TooManyRequests' } },
        headers: { 'retry-after': '30' },
      });

      const { graph: baseGraph } = buildStubGraph(MINIMAL_FIXTURE as Record<string, unknown>);
      const graph = { ...baseGraph, getPlan: vi.fn().mockRejectedValue(throttleError) };

      const planner = buildPlannerMocks(EMPTY_LOCAL_STATE);
      const deps = buildDeps(graph, planLinkRepo, etagRepo, planner);

      await expect(
        runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps),
      ).rejects.toThrow(/Too Many Requests/);

      // Two markPlanSyncStatus calls: first 'pulling', then 'error'
      const calls = vi.mocked(planner.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ plan_id: PLAN_ID, status: 'pulling' });
      expect(calls[1]).toMatchObject({
        plan_id: PLAN_ID,
        status: 'error',
        last_error: expect.stringMatching(/Too Many Requests/),
      });
    });
  });

  it('marks status error for any other throw (non-429)', async () => {
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

      const genericError = new Error('boom');
      const { graph: baseGraph } = buildStubGraph(MINIMAL_FIXTURE as Record<string, unknown>);
      const graph = { ...baseGraph, getPlan: vi.fn().mockRejectedValue(genericError) };

      const planner = buildPlannerMocks(EMPTY_LOCAL_STATE);
      const deps = buildDeps(graph, planLinkRepo, etagRepo, planner);

      await expect(
        runPlanPull({ tenant_id: TENANT_ID, plan_id: PLAN_ID, full: false }, deps),
      ).rejects.toThrow(/boom/);

      const calls = vi.mocked(planner.markPlanSyncStatus).mock.calls.map((c) => c[0]);
      expect(calls).toHaveLength(2);
      expect(calls[0]).toMatchObject({ plan_id: PLAN_ID, status: 'pulling' });
      expect(calls[1]).toMatchObject({
        plan_id: PLAN_ID,
        status: 'error',
        last_error: expect.stringMatching(/boom/),
      });
    });
  });
});
