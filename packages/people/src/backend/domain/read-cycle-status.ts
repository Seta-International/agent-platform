import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { CycleStatusQuery, CycleStatusResponse } from '../../contracts.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { resolveOverrideActive } from './cycle-unlock.ts';
import { classifyCycleStatus, monthClockNow, vnYearMonth } from './month-clock.ts';
import { loadPerformanceCapacities } from './read-performance-context.ts';

/**
 * The account whose unlock state this caller may be told about. `account_id` arrives
 * from the query string, so an arbitrary id would otherwise let any performance reader
 * probe which accounts PMO has reopened. An org-viewer legitimately sees every account;
 * everyone else only the ones they are allocated to this month.
 */
async function scopedAccountId(
  session: SessionScope,
  input: CycleStatusQuery,
): Promise<string | null> {
  const requested = input.account_id ?? null;
  if (!requested) return null;
  if (can(session, 'people.performance.read_org')) return requested;
  if (!session.person_id) return null;
  const capacities = await loadPerformanceCapacities(session, session.person_id, input.month);
  return capacities.some((c) => c.account_id === requested) ? requested : null;
}

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
  // Unlock is per account (FUT-781), so the badge only flips to "override" for the
  // account the caller is looking at. Without one there is nothing scoped to reopen.
  const overrideActive = await resolveOverrideActive(session, {
    month: input.month,
    account_id: await scopedAccountId(session, input),
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
