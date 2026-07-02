// packages/planner/src/backend/orchestration/weekly-plan/scheduling.ts
import type { Insight, NormalizedTask, PlanWindow, Weekday, WeeklyPlan } from './schemas.ts';
import { WEEKDAY_ORDER } from './schemas.ts';

export type WeekChoice = 'this' | 'next';

// "next week" phrasings (English + Vietnamese). Everything else plans the current week.
const NEXT_WEEK_RE = /\b(next|upcoming) week\b|tuần (sau|tới)/i;

/** Deterministic this-vs-next decision made by the runtime BEFORE any LLM runs. */
export function resolveWeekChoice(userText: string): WeekChoice {
  return NEXT_WEEK_RE.test(userText) ? 'next' : 'this';
}

// ─── Local-date helpers ──────────────────────────────────────────────────────

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/** The calendar date + Monday-based weekday index (0=Mon … 6=Sun) of `now` in `timezone`. */
function localDate(now: Date, timezone?: string): { iso: string; dayIdx: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    iso: `${get('year')}-${get('month')}-${get('day')}`,
    dayIdx: WEEKDAY_SHORT.indexOf(get('weekday') as (typeof WEEKDAY_SHORT)[number]),
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The plannable window.
 * - 'this' on a weekday: today … this Friday (mid-week ask plans the remaining days).
 * - 'this' on a weekend: the upcoming Mon–Fri.
 * - 'next': the Monday after the current ISO week … its Friday (on a weekend this is
 *   the imminent Mon–Fri — same result as a weekend 'this', by design).
 * `timezone` is optional (IANA name); omitted = server timezone. No per-user timezone
 * source exists in identity today — the parameter future-proofs the signature.
 */
export function resolvePlanWindow(now: Date, week: WeekChoice, timezone?: string): PlanWindow {
  const { iso: today, dayIdx } = localDate(now, timezone);
  const isWeekend = dayIdx >= 5;
  const currentMonday = addDays(today, -dayIdx);
  const upcomingMonday = addDays(currentMonday, 7);
  const planMonday = week === 'this' && !isWeekend ? currentMonday : upcomingMonday;
  const startsToday = week === 'this' && !isWeekend;
  return {
    startDay: WEEKDAY_ORDER[startsToday ? dayIdx : 0] as Weekday,
    endDay: 'fri',
    weekStart: startsToday ? today : planMonday,
    weekEnd: addDays(planMonday, 4),
  };
}

// ─── Pre-pass ────────────────────────────────────────────────────────────────

const PRIORITY_RANK = { urgent: 0, important: 1, medium: 2, low: 3 } as const;

/** Overdue first, then earliest due date (nulls last), then priority. Non-mutating. */
export function prePassOrder(tasks: NormalizedTask[]): NormalizedTask[] {
  return [...tasks].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.dueAt !== b.dueAt) {
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      return a.dueAt < b.dueAt ? -1 : 1;
    }
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
}

/** The weekdays inside the window, in order. */
export function windowDays(window: PlanWindow): Weekday[] {
  return WEEKDAY_ORDER.slice(WEEKDAY_ORDER.indexOf(window.startDay)) as Weekday[];
}

/** Per-day task target used as a balancing hint for the LLM and the fallback plan. */
export function capacityHint(taskCount: number, window: PlanWindow): number {
  return Math.ceil(taskCount / windowDays(window).length);
}
