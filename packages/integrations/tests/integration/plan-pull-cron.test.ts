import { describe, expect, it, vi } from 'vitest';
import { runPlanPullCron } from '../../src/m365/jobs/plan-pull-cron.ts';
import { createM365PlanLinkRepo } from '../../src/m365/plans/repo.ts';
import { withIntegrationsTestDb } from '../helpers/test-db.ts';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GROUP_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const GROUP_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('runPlanPullCron', () => {
  it('no live links → no enqueues', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkRepo = createM365PlanLinkRepo({ db });
      const addJob = vi.fn().mockResolvedValue(undefined);

      const result = await runPlanPullCron({ planLinkRepo, addJob });

      expect(result.enqueued).toBe(0);
      expect(addJob).not.toHaveBeenCalled();
    });
  });

  it('N live links → N enqueues with correct payload, jobKey, and deterministic runAt', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkRepo = createM365PlanLinkRepo({ db });

      await planLinkRepo.upsert({
        tenantId: TENANT_A,
        groupId: GROUP_A,
        planId: '11111111-1111-1111-1111-111111111101',
        externalId: 'P-EXT-1',
        initialSnapshot: {},
      });
      await planLinkRepo.upsert({
        tenantId: TENANT_A,
        groupId: GROUP_A,
        planId: '11111111-1111-1111-1111-111111111102',
        externalId: 'P-EXT-2',
        initialSnapshot: {},
      });
      await planLinkRepo.upsert({
        tenantId: TENANT_B,
        groupId: GROUP_B,
        planId: '11111111-1111-1111-1111-111111111103',
        externalId: 'P-EXT-3',
        initialSnapshot: {},
      });

      const addJob = vi.fn().mockResolvedValue(undefined);
      const nowDate = new Date('2026-01-01T00:00:00.000Z');
      const now = () => nowDate;
      const random = () => 0.5; // jitter = Math.floor(0.5 * 60_000) = 30000 ms

      const result = await runPlanPullCron({ planLinkRepo, addJob, now, random });

      expect(result.enqueued).toBe(3);
      expect(addJob).toHaveBeenCalledTimes(3);

      const calls = addJob.mock.calls;

      // All calls use 'm365.plan.pull' identifier
      for (const call of calls) {
        expect(call[0]).toBe('m365.plan.pull');
        expect(call[1].full).toBe(false);
      }

      // Collect actual payloads
      const payloads = calls.map((c) => ({ tenantId: c[1].tenant_id, planId: c[1].plan_id }));
      const _keys = calls.map((c) => c[2].jobKey as string);
      const runAts = calls.map((c) => c[2].runAt as Date);

      // Each jobKey is tenantId:planId
      for (const call of calls) {
        const { tenant_id, plan_id } = call[1] as { tenant_id: string; plan_id: string };
        expect(call[2].jobKey).toBe(`${tenant_id}:${plan_id}`);
      }

      // runAt is now + 30000 ms for all (deterministic random = 0.5)
      const expectedRunAt = new Date(nowDate.getTime() + 30000);
      for (const runAt of runAts) {
        expect(runAt.getTime()).toBe(expectedRunAt.getTime());
      }

      // payloads cover all 3 plans
      const planIds = payloads.map((p) => p.planId).sort();
      expect(planIds).toEqual([
        '11111111-1111-1111-1111-111111111101',
        '11111111-1111-1111-1111-111111111102',
        '11111111-1111-1111-1111-111111111103',
      ]);
    });
  });

  it('tombstoned link is NOT enqueued', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkRepo = createM365PlanLinkRepo({ db });

      const _live = await planLinkRepo.upsert({
        tenantId: TENANT_A,
        groupId: GROUP_A,
        planId: '22222222-2222-2222-2222-222222222201',
        externalId: 'P-LIVE',
        initialSnapshot: {},
      });
      const dead = await planLinkRepo.upsert({
        tenantId: TENANT_A,
        groupId: GROUP_A,
        planId: '22222222-2222-2222-2222-222222222202',
        externalId: 'P-DEAD',
        initialSnapshot: {},
      });
      await planLinkRepo.tombstone(dead.id);

      const addJob = vi.fn().mockResolvedValue(undefined);
      const result = await runPlanPullCron({ planLinkRepo, addJob });

      expect(result.enqueued).toBe(1);
      expect(addJob).toHaveBeenCalledTimes(1);
      expect(addJob.mock.calls[0]![1].plan_id).toBe('22222222-2222-2222-2222-222222222201');
    });
  });

  it('jitter range: random=0 → runAt=now, random=0.999 → runAt=now+59940ms', async () => {
    await withIntegrationsTestDb(async ({ db }) => {
      const planLinkRepo = createM365PlanLinkRepo({ db });

      await planLinkRepo.upsert({
        tenantId: TENANT_A,
        groupId: GROUP_A,
        planId: '33333333-3333-3333-3333-333333333301',
        externalId: 'P-JITTER',
        initialSnapshot: {},
      });

      const nowDate = new Date('2026-06-01T12:00:00.000Z');
      const now = () => nowDate;

      // Test random=0 → jitter = Math.floor(0 * 60000) = 0
      const addJob0 = vi.fn().mockResolvedValue(undefined);
      await runPlanPullCron({ planLinkRepo, addJob: addJob0, now, random: () => 0 });
      expect(addJob0.mock.calls[0]![2].runAt.getTime()).toBe(nowDate.getTime());

      // Test random=0.999 → jitter = Math.floor(0.999 * 60000) = 59940
      const addJob999 = vi.fn().mockResolvedValue(undefined);
      await runPlanPullCron({ planLinkRepo, addJob: addJob999, now, random: () => 0.999 });
      expect(addJob999.mock.calls[0]![2].runAt.getTime()).toBe(nowDate.getTime() + 59940);
    });
  });
});
