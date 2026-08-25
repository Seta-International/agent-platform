import type { SessionScope } from '@seta/core';
import { and, avg, count, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';
import type { MoraleTrendPoint, MoraleTrendQuery, MoraleTrendResponse } from '../../contracts.ts';
import { peopleDb } from '../db/client.ts';
import { moraleRatingAggregate } from '../db/schema.ts';
import { PeopleError, requirePermission } from '../rbac.ts';
import { vnYearMonth } from './month-clock.ts';
import { type MoraleTrendScope, resolveMoraleReviewerScope } from './morale-reviewer-scope.ts';

/**
 * Smallest group whose average will be shown (AC5).
 *
 * Under this, a reader who knows the team could reconstruct individual scores from the
 * mean, so the month is returned without one. The count still travels: "3 responses,
 * needs 4" tells a lead to encourage replies, where a silent gap reads like a bug.
 */
export const MIN_TREND_RESPONSES = 4;

/** How far back the trend opens when the caller names no window. */
const DEFAULT_MONTHS = 12;

function parseMonth(month: string): { year: number; month: number } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { year: y, month: m };
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** `month` shifted by `delta` calendar months, staying in `YYYY-MM`. */
function shiftMonth(month: string, delta: number): string {
  const { year, month: m } = parseMonth(month);
  const zeroBased = year * 12 + (m - 1) + delta;
  return formatMonth(Math.floor(zeroBased / 12), (zeroBased % 12) + 1);
}

/** Every month from `from` to `to`, inclusive. */
function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = shiftMonth(m, 1)) out.push(m);
  return out;
}

/**
 * Resolves the requested window against the calendar.
 *
 * The end is clamped to the current month rather than rejected: a future month is not a
 * mistake worth an error page — there is simply nothing there yet, and clamping keeps a
 * bookmarked link working into the next month instead of breaking on the 1st.
 * An inverted range *is* rejected, because there is no honest answer to give it.
 */
export function resolveTrendWindow(query: MoraleTrendQuery): { from: string; to: string } {
  const currentMonth = vnYearMonth();
  const to = query.to_month && query.to_month < currentMonth ? query.to_month : currentMonth;
  const from = query.from_month ?? shiftMonth(to, -(DEFAULT_MONTHS - 1));

  if (from > to) {
    throw new PeopleError('VALIDATION', 'from_month must not be later than to_month');
  }
  return { from, to };
}

/**
 * The anonymous morale trend for the group this caller is responsible for (AC5).
 *
 * Reads `morale_rating_aggregate` and nothing else: that table carries no person_id and
 * no timestamp finer than the month, so no query here can be pointed at an individual.
 * Scope comes from capacity — the organisation for HR/PMO/BoD, their accounts for an AM,
 * their projects for a TL — and is resolved server-side, never passed in.
 *
 * Months with no responses at all are still returned, so the chart's x-axis stays a
 * continuous calendar and a quiet month is visibly quiet rather than absent.
 */
export async function getMoraleTrend(
  session: SessionScope,
  query: MoraleTrendQuery = {},
): Promise<MoraleTrendResponse> {
  requirePermission(session, 'people.performance.read');

  const { can_review, trend } = await resolveMoraleReviewerScope(session);
  if (!can_review || !trend) {
    throw new PeopleError('FORBIDDEN', 'The morale trend is only visible to note recipients');
  }

  const { from, to } = resolveTrendWindow(query);
  const months = monthsInRange(from, to);

  const scope = scopeCondition(trend);

  // An AM with no accounts or a TL with no projects would not be a reviewer at all, so
  // this is unreachable in practice — but an empty `IN ()` is a silent always-false
  // filter, and skipping the query says so out loud instead.
  const rows = scope.isEmpty
    ? []
    : await peopleDb()
        .select({
          period: moraleRatingAggregate.period,
          responses: count(),
          average: avg(moraleRatingAggregate.rating),
        })
        .from(moraleRatingAggregate)
        .where(
          and(
            eq(moraleRatingAggregate.tenant_id, session.tenant_id),
            gte(moraleRatingAggregate.period, from),
            lte(moraleRatingAggregate.period, to),
            scope.condition,
          ),
        )
        .groupBy(moraleRatingAggregate.period);

  const byPeriod = new Map(rows.map((r) => [r.period, r]));

  const points: MoraleTrendPoint[] = months.map((period) => {
    const row = byPeriod.get(period);
    const responses = row ? Number(row.responses) : 0;
    return {
      period,
      responses,
      average:
        responses >= MIN_TREND_RESPONSES && row?.average !== null && row?.average !== undefined
          ? Math.round(Number(row.average) * 10) / 10
          : null,
    };
  });

  return {
    from_month: from,
    to_month: to,
    min_responses: MIN_TREND_RESPONSES,
    // Hidden months included: this is how many people spoke up in the window, which is a
    // fact about participation and reveals nothing about any one of them.
    total_responses: points.reduce((sum, p) => sum + p.responses, 0),
    points,
  };
}

/**
 * Translates a reviewer's capacity into the rows they may average over.
 *
 * `condition: undefined` is org-wide — every row in the tenant, no extra predicate —
 * which `and()` drops. `isEmpty` is the separate case of a scope that names nothing.
 */
function scopeCondition(trend: MoraleTrendScope): { condition?: SQL; isEmpty: boolean } {
  if (trend.kind === 'org') return { isEmpty: false };
  if (trend.kind === 'account') {
    return {
      condition: inArray(moraleRatingAggregate.account_id, trend.account_ids),
      isEmpty: trend.account_ids.length === 0,
    };
  }
  return {
    condition: inArray(moraleRatingAggregate.project_id, trend.project_ids),
    isEmpty: trend.project_ids.length === 0,
  };
}
