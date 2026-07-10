import { executorPool, maintenance } from '@seta/shared-db';
import { type MastraLifecycleEvent, onLifecycleEvent } from '../workflows/_infra/lifecycle-hook.ts';

// Revival: graphile-worker stores payloads as JSON, so Date fields arrive as
// ISO strings. We only need to revive the two Date fields the type uses.
function reviveDates(raw: Record<string, unknown>): MastraLifecycleEvent {
  const r = { ...raw };
  if (typeof r.occurredAt === 'string') r.occurredAt = new Date(r.occurredAt);
  if (typeof r.expiresAt === 'string') r.expiresAt = new Date(r.expiresAt);
  return r as unknown as MastraLifecycleEvent;
}

/**
 * Admin, like the in-process path this retries: `onLifecycleEvent` recovers a missing
 * `tenant_id` by reading `agent.workflow_runs` for the run id, which no tenant scope can
 * serve. `wrapJob` cannot scope this job anyway — the dead-lettered payload is a
 * `MastraLifecycleEvent`, whose tenant field is `tenantId`, not the `tenant_id` wrapJob reads.
 */
export async function retryLifecycleEvent(payload: Record<string, unknown>): Promise<void> {
  await maintenance(() => onLifecycleEvent(executorPool(), reviveDates(payload)));
}
