import { describe, expect, it, vi } from 'vitest';
import type { RunAutoMirrorDeps } from '../../src/backend/m365/plans/auto-mirror.ts';
import { runAutoMirror } from '../../src/backend/m365/plans/auto-mirror.ts';
import type { PlansGraph } from '../../src/backend/m365/plans/graph.ts';
import { createM365PlanLinkRepo } from '../../src/backend/m365/plans/repo.ts';
import { createM365GroupLinkRepo } from '../../src/backend/m365/repo.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const GROUP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EXTERNAL_GROUP_ID = 'ext-group-001';

const REMOTE_PLANS = [
  { id: 'ext-plan-1', title: 'Plan Alpha', '@odata.etag': '"etag1"' },
  { id: 'ext-plan-2', title: 'Plan Beta', '@odata.etag': '"etag2"' },
  { id: 'ext-plan-3', title: 'Plan Gamma', '@odata.etag': '"etag3"' },
];

// UUID map for plan stubs — plan_id in m365_plan_links must be a valid UUID.
const PLAN_IDS: Record<string, string> = {
  'ext-plan-1': '10000000-0000-0000-0000-000000000001',
  'ext-plan-2': '10000000-0000-0000-0000-000000000002',
  'ext-plan-3': '10000000-0000-0000-0000-000000000003',
};

function buildStubGraph(): PlansGraph {
  return {
    listGroupPlans: vi.fn().mockResolvedValue(REMOTE_PLANS),
    getPlan: vi.fn(),
    getPlanDetails: vi.fn(),
    listBuckets: vi.fn(),
    listTasks: vi.fn(),
    getTaskDetails: vi.fn(),
    getBucketTaskBoardTaskFormat: vi.fn(),
  } as unknown as PlansGraph;
}

describe('runAutoMirror', () => {
  it('initial mirror creates 3 plans + 3 links + enqueues 3 pull jobs', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      // Seed the group link row so the repo can look it up during subscriber tests.
      // For runAutoMirror directly, this row is not required — the function receives
      // external_group_id as direct input. But we create it for completeness.
      const groupLinkRepo = createM365GroupLinkRepo({ db });
      await groupLinkRepo.upsert({
        tenantId: TENANT_ID,
        groupId: GROUP_ID,
        externalId: EXTERNAL_GROUP_ID,
        lastSyncedFields: {},
      });

      const planLinkRepo = createM365PlanLinkRepo({ db });
      const graph = buildStubGraph();

      const createPlan = vi.fn().mockImplementation(async ({ external_id, name }) => ({
        id: PLAN_IDS[external_id as string] ?? '00000000-0000-0000-0000-000000000000',
        name,
      }));
      const linkPlanToM365 = vi.fn().mockResolvedValue(undefined);
      const enqueuePlanPull = vi.fn().mockResolvedValue(undefined);

      const deps: RunAutoMirrorDeps = {
        graph,
        planLinkRepo,
        planner: { createPlan, linkPlanToM365 },
        enqueuePlanPull,
        buildSystemSession: (tenantId) => ({
          session_id: '00000000-0000-0000-0000-00000000m365',
          user_id: '00000000-0000-0000-0000-000000000000',
          tenant_id: tenantId,
          email: 'system+integrations.m365@seta.internal',
          display_name: 'M365 Sync System',
          role_summary: {
            roles: ['system.integrations.m365'],
            cross_tenant_read: false,
          },
          role_summary_hash: 'system-integrations-m365',
          accessible_group_ids: [],
          cross_tenant_read: false,
          built_at: new Date(),
          invalidated_at: null,
          actor: { kind: 'system', system_id: 'integrations.m365' },
        }),
      };

      const result = await runAutoMirror(
        { tenant_id: TENANT_ID, group_id: GROUP_ID, external_group_id: EXTERNAL_GROUP_ID },
        deps,
      );

      // Verify return value
      expect(result.mirrored).toHaveLength(3);
      expect(result.skipped).toHaveLength(0);

      const mirroredExtIds = result.mirrored.map((m) => m.external_id).sort();
      expect(mirroredExtIds).toEqual(['ext-plan-1', 'ext-plan-2', 'ext-plan-3']);

      // Verify planner stubs called correctly
      expect(createPlan).toHaveBeenCalledTimes(3);
      for (const plan of REMOTE_PLANS) {
        expect(createPlan).toHaveBeenCalledWith(
          expect.objectContaining({ external_source: 'm365', external_id: plan.id }),
        );
      }
      expect(linkPlanToM365).toHaveBeenCalledTimes(3);
      expect(enqueuePlanPull).toHaveBeenCalledTimes(3);
      for (const plan of REMOTE_PLANS) {
        expect(enqueuePlanPull).toHaveBeenCalledWith(
          expect.objectContaining({
            tenant_id: TENANT_ID,
            plan_id: PLAN_IDS[plan.id],
            full: true,
          }),
        );
      }

      // Verify DB rows
      const links = await planLinkRepo.listByGroup(TENANT_ID, GROUP_ID);
      expect(links).toHaveLength(3);
      const linkedExtIds = links.map((l) => l.externalId).sort();
      expect(linkedExtIds).toEqual(['ext-plan-1', 'ext-plan-2', 'ext-plan-3']);
    });
  });

  it('idempotent re-run: 0 plans created the second time, all skipped', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkRepo = createM365PlanLinkRepo({ db });
      const graph = buildStubGraph();

      const createPlan = vi.fn().mockImplementation(async ({ external_id, name }) => ({
        id: PLAN_IDS[external_id as string] ?? '00000000-0000-0000-0000-000000000000',
        name,
      }));
      const linkPlanToM365 = vi.fn().mockResolvedValue(undefined);
      const enqueuePlanPull = vi.fn().mockResolvedValue(undefined);

      const deps: RunAutoMirrorDeps = {
        graph,
        planLinkRepo,
        planner: { createPlan, linkPlanToM365 },
        enqueuePlanPull,
        buildSystemSession: (tenantId) => ({
          session_id: '00000000-0000-0000-0000-00000000m365',
          user_id: '00000000-0000-0000-0000-000000000000',
          tenant_id: tenantId,
          email: 'system+integrations.m365@seta.internal',
          display_name: 'M365 Sync System',
          role_summary: {
            roles: ['system.integrations.m365'],
            cross_tenant_read: false,
          },
          role_summary_hash: 'system-integrations-m365',
          accessible_group_ids: [],
          cross_tenant_read: false,
          built_at: new Date(),
          invalidated_at: null,
          actor: { kind: 'system', system_id: 'integrations.m365' },
        }),
      };

      const input = {
        tenant_id: TENANT_ID,
        group_id: GROUP_ID,
        external_group_id: EXTERNAL_GROUP_ID,
      };

      // First run
      const first = await runAutoMirror(input, deps);
      expect(first.mirrored).toHaveLength(3);
      expect(first.skipped).toHaveLength(0);
      expect(createPlan).toHaveBeenCalledTimes(3);

      // Reset the graph stub so it returns the same plans again
      vi.mocked(graph.listGroupPlans).mockResolvedValue(REMOTE_PLANS);

      // Second run — same deps, same DB
      const second = await runAutoMirror(input, deps);
      expect(second.mirrored).toHaveLength(0);
      expect(second.skipped).toHaveLength(3);
      for (const s of second.skipped) {
        expect(s.reason).toBe('already_linked');
      }

      // createPlan still called only 3 times total (not 6)
      expect(createPlan).toHaveBeenCalledTimes(3);

      // DB rows unchanged
      const links = await planLinkRepo.listByGroup(TENANT_ID, GROUP_ID);
      expect(links).toHaveLength(3);
    });
  });
});
