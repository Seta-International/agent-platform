import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema/index.ts';
import { coreSubscriptionFailureState } from '../../db/schema/index.ts';

export interface FailureEntry {
  eventId: string;
  attempts: number;
  firstFailedAt: Date;
  lastError: string;
  nextRetryAt: number;
}

export async function bumpFailureStateDb(
  db: NodePgDatabase<typeof schema>,
  subscription: string,
  eventId: string,
  err: unknown,
  opts: { baseMs: number; maxMs: number },
): Promise<number> {
  const existing = await getFailureEntryDb(db, subscription);
  const sameEvent = existing && existing.eventId === eventId ? existing : null;
  const attempts = sameEvent ? sameEvent.attempts + 1 : 1;
  const firstFailedAt = sameEvent ? sameEvent.firstFailedAt : new Date();
  const delay = Math.min(opts.maxMs, opts.baseMs * 2 ** (attempts - 1));
  const lastError = err instanceof Error ? err.message : String(err);
  const nextRetryAt = new Date(Date.now() + delay);

  await db
    .insert(coreSubscriptionFailureState)
    .values({
      subscription,
      eventId,
      attempts,
      firstFailedAt,
      lastError,
      nextRetryAt,
    })
    .onConflictDoUpdate({
      target: coreSubscriptionFailureState.subscription,
      set: {
        eventId,
        attempts,
        firstFailedAt,
        lastError,
        nextRetryAt,
        updatedAt: new Date(),
      },
    });
  return attempts;
}

export async function clearFailureStateDb(
  db: NodePgDatabase<typeof schema>,
  subscription: string,
  // Callers (drain.ts) only invoke clear after a successful handle of `eventId`, so the
  // SQL doesn't need to repeat the check.
  _eventId: string,
): Promise<void> {
  await db
    .delete(coreSubscriptionFailureState)
    .where(eq(coreSubscriptionFailureState.subscription, subscription));
}

export async function getFailureEntryDb(
  db: NodePgDatabase<typeof schema>,
  subscription: string,
): Promise<FailureEntry | undefined> {
  const rows = await db
    .select()
    .from(coreSubscriptionFailureState)
    .where(eq(coreSubscriptionFailureState.subscription, subscription))
    .limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return {
    eventId: r.eventId,
    attempts: r.attempts,
    firstFailedAt: r.firstFailedAt,
    lastError: r.lastError,
    nextRetryAt: r.nextRetryAt.getTime(),
  };
}

export async function resetAllFailureStateDb(db: NodePgDatabase<typeof schema>): Promise<void> {
  await db.delete(coreSubscriptionFailureState);
}
