import { getPool } from '@seta/shared-db';
import { type MastraLifecycleEvent, onLifecycleEvent } from '../workflows/_infra/lifecycle-hook.ts';

// Revival: graphile-worker stores payloads as JSON, so Date fields arrive as
// ISO strings. We only need to revive the two Date fields the type uses.
function reviveDates(raw: Record<string, unknown>): MastraLifecycleEvent {
  const r = { ...raw };
  if (typeof r.occurredAt === 'string') r.occurredAt = new Date(r.occurredAt);
  if (typeof r.expiresAt === 'string') r.expiresAt = new Date(r.expiresAt);
  return r as unknown as MastraLifecycleEvent;
}

export async function retryLifecycleEvent(payload: Record<string, unknown>): Promise<void> {
  const pool = getPool('worker');
  await onLifecycleEvent(pool, reviveDates(payload));
}
