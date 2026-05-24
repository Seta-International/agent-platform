import type { M365PlanLinkRepo } from '../plans/repo.ts';

export interface RunPlanPullCronDeps {
  planLinkRepo: M365PlanLinkRepo;
  // Injected so the cron is testable. Production wiring passes graphile-worker's runner.addJob.
  addJob: (
    identifier: string,
    payload: { tenant_id: string; plan_id: string; full: boolean },
    spec?: { jobKey?: string; runAt?: Date },
  ) => Promise<void>;
  // Pluggable for deterministic tests.
  now?: () => Date;
  // 0..1 random; pluggable for deterministic tests. Default Math.random.
  random?: () => number;
}

export interface RunPlanPullCronResult {
  enqueued: number;
}

export async function runPlanPullCron(deps: RunPlanPullCronDeps): Promise<RunPlanPullCronResult> {
  const now = (deps.now ?? (() => new Date()))();
  const random = deps.random ?? Math.random;

  const links = await deps.planLinkRepo.listAllLive();

  for (const link of links) {
    const jitterMs = Math.floor(random() * 60_000);
    await deps.addJob(
      'm365.plan.pull',
      { tenant_id: link.tenantId, plan_id: link.planId, full: false },
      { jobKey: `${link.tenantId}:${link.planId}`, runAt: new Date(now.getTime() + jitterMs) },
    );
  }

  return { enqueued: links.length };
}
