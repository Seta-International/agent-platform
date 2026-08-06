import { localDayBounds, PLATFORM_TIMEZONE } from '@seta/agent-sdk';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turns a calendar day into an absolute instant so the approval card always
 * shows a real timestamp, never a relative phrase or a bare date whose meaning
 * depends on the reader's clock.
 *
 * `end`   → 23:59 platform-local (the due-date convention chosen for A2).
 * `start` → 00:00 platform-local.
 *
 * A value that already carries a time is returned untouched: the model was
 * explicit, and second-guessing it would silently move the user's deadline.
 */
export function normalizeInstant(
  value: string,
  edge: 'start' | 'end',
  tz: string = PLATFORM_TIMEZONE,
): string {
  if (!DATE_ONLY.test(value)) return value;
  const { start, end } = localDayBounds(value, tz);
  // `end` is the exclusive start of the NEXT local day; one minute back is 23:59.
  return edge === 'start' ? start.toISOString() : new Date(end.getTime() - 60_000).toISOString();
}
