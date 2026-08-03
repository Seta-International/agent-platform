/** The per-tenant key both the cron and the admin `POST /directory/sync` route enqueue under. */
export function directoryPullJobKey(tenantId: string): string {
  return `m365.directory.pull:${tenantId}`;
}

export interface RunDirectoryPullCronDeps {
  /** M365-enabled tenants. Injected so the cron is testable; production passes the real query. */
  listTenantIds: () => Promise<string[]>;
  // Injected for the same reason. Production wiring passes graphile-worker's runner.addJob.
  addJob: (
    identifier: string,
    payload: { tenant_id: string; full: boolean },
    spec?: { jobKey?: string },
  ) => Promise<void>;
}

export interface RunDirectoryPullCronResult {
  enqueued: number;
}

/**
 * Fans the nightly `30 2 * * *` tick out into one `m365.directory.pull` per M365-enabled tenant
 * (design §10).
 *
 * Every enqueue carries the per-tenant `jobKey`, so a tenant whose previous pull is still queued
 * gets its job replaced rather than doubled — two concurrent pulls of one directory would race
 * each other through the same `people` write door. The key is shared with the admin sync route on
 * purpose: an admin-triggered `full: true` supersedes a queued nightly run, which is the safe
 * direction (a full run is a superset of an incremental one).
 *
 * The tick is deliberately not jittered. Each tenant pulls its own Entra tenant through its own
 * token bucket, so spreading them buys nothing, and a deterministic `runAt` keeps the jobKey
 * collapse observable.
 */
export async function runDirectoryPullCron(
  deps: RunDirectoryPullCronDeps,
): Promise<RunDirectoryPullCronResult> {
  const tenantIds = await deps.listTenantIds();

  for (const tenantId of tenantIds) {
    await deps.addJob(
      'm365.directory.pull',
      { tenant_id: tenantId, full: false },
      { jobKey: directoryPullJobKey(tenantId) },
    );
  }

  return { enqueued: tenantIds.length };
}
