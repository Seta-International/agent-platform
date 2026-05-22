export interface FailureEntry {
  eventId: string;
  attempts: number;
  firstFailedAt: Date;
  lastError: Error;
  nextRetryAt: number;
}

const state = new Map<string, FailureEntry>();

export function bumpFailureState(
  subscription: string,
  eventId: string,
  err: unknown,
  opts: { baseMs: number; maxMs: number },
): number {
  const existing = state.get(subscription);
  const attempts = existing?.eventId === eventId ? existing.attempts + 1 : 1;
  const firstFailedAt = existing?.eventId === eventId ? existing.firstFailedAt : new Date();
  const delay = Math.min(opts.maxMs, opts.baseMs * 2 ** (attempts - 1));
  state.set(subscription, {
    eventId,
    attempts,
    firstFailedAt,
    lastError: err instanceof Error ? err : new Error(String(err)),
    nextRetryAt: Date.now() + delay,
  });
  return attempts;
}

export function clearFailureState(subscription: string, eventId: string): void {
  const e = state.get(subscription);
  if (e?.eventId === eventId) state.delete(subscription);
}

export function getFailureEntry(subscription: string): FailureEntry | undefined {
  return state.get(subscription);
}

export function resetAllFailureState(): void {
  state.clear();
}
