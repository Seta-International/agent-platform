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

// ─── Validation ──────────────────────────────────────────────────────────────

/** The weekday a due date falls on when it lies inside the planned week; null otherwise
 *  (including Sat/Sun due dates, which constrain nothing). */
export function dueDayInWindow(dueAt: string | null, window: PlanWindow): Weekday | null {
  if (!dueAt) return null;
  const due = dueAt.slice(0, 10);
  const monday = addDays(window.weekEnd, -4);
  if (due < monday || due > window.weekEnd) return null;
  const idx = Math.round(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / 86_400_000,
  );
  return (WEEKDAY_ORDER[idx] as Weekday | undefined) ?? null;
}

export interface PlanValidation {
  ok: boolean;
  /** Human-readable violations — fed back to the LLM verbatim on the repair attempt. */
  violations: string[];
}

export function validatePlan(
  plan: WeeklyPlan,
  tasks: NormalizedTask[],
  window: PlanWindow,
): PlanValidation {
  const violations: string[] = [];
  const allowed = new Set(windowDays(window));
  const dayIdx = new Map(WEEKDAY_ORDER.map((d, i) => [d, i]));

  const placed = new Map<string, number>();
  for (const day of plan.days) {
    if (!allowed.has(day.day)) {
      violations.push(`day "${day.day}" is outside the planning window (${window.startDay}-fri)`);
    }
    for (const block of day.blocks) {
      for (const title of block.taskTitles) placed.set(title, (placed.get(title) ?? 0) + 1);
    }
  }

  if (plan.unplaced.length > 0) violations.push(`unplaced tasks: ${plan.unplaced.join(', ')}`);

  const expected = new Map<string, number>();
  for (const t of tasks) expected.set(t.title, (expected.get(t.title) ?? 0) + 1);
  for (const [title, n] of expected) {
    const got = placed.get(title) ?? 0;
    if (got !== n) violations.push(`task "${title}" placed ${got} time(s), expected ${n}`);
  }
  for (const title of placed.keys()) {
    if (!expected.has(title)) violations.push(`unknown task "${title}" in plan`);
  }

  for (const t of tasks) {
    const dueDay = dueDayInWindow(t.dueAt, window);
    if (!dueDay) continue;
    for (const day of plan.days) {
      const inDay = day.blocks.some((b) => b.taskTitles.includes(t.title));
      if (inDay && (dayIdx.get(day.day) ?? 0) > (dayIdx.get(dueDay) ?? 4)) {
        violations.push(`task "${t.title}" is due ${dueDay} but placed on ${day.day}`);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
