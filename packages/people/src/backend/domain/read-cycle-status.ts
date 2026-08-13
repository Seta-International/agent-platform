import type { SessionScope } from '@seta/core';
import type { CycleStatusQuery, CycleStatusResponse } from '../../contracts.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { resolveOverrideActive } from './cycle-unlock.ts';
import { classifyCycleStatus, monthClockNow, vnYearMonth } from './month-clock.ts';

/**
 * Read the server-authoritative cycle window for a Performance month (FUT-694).
 * Captures transaction-start once; FE must only echo the returned status.
 */
export async function readCycleStatus(
  session: SessionScope,
  input: CycleStatusQuery,
): Promise<CycleStatusResponse> {
  requirePermission(session, 'people.performance.read');
  const at = monthClockNow();
  // The badge reflects the viewer's own window: a month-wide unlock, or one scoped to
  // this person, flips it to "override" (FUT-781).
  const overrideActive = await resolveOverrideActive(session, {
    month: input.month,
    person_id: session.person_id,
  });
  const { status, evaluated_at } = classifyCycleStatus({
    month: input.month,
    at,
    overrideActive,
  });
  return { month: input.month, status, evaluated_at };
}

/** Default month for the badge when the client omits `?month=`. */
export function defaultCycleMonth(at: Date = monthClockNow()): string {
  return vnYearMonth(at);
}

export function parseCycleMonthOrThrow(raw: string | undefined): string {
  const month = raw ?? defaultCycleMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new PeopleError('VALIDATION', 'month: expected YYYY-MM');
  }
  return month;
}
