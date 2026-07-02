/**
 * Concrete relative-date anchors, recomputed from `now` on every call.
 *
 * The chat agents kept hallucinating due dates (observed `dueBefore: '2024-06-09'`
 * with no year anchor). Rather than let the model do calendar arithmetic — or pay
 * for an extra resolver tool round-trip — we compute the real dates here and embed
 * them as worked examples in the agent instructions. Values are flexible: they
 * shift with the current date because the instruction builders call this fresh.
 *
 * All math is UTC and weeks start Monday (ISO). Upper bounds named `*DueBefore`
 * are EXCLUSIVE, matching planner.tasks filtering (`due_at < due_before`, see
 * domain/list-tasks.ts).
 */
export interface DateAnchors {
  today: string;
  tomorrow: string;
  yesterday: string;
  thisWeekStart: string;
  thisWeekEnd: string;
  nextWeekStart: string;
  nextWeekEnd: string;
  lastWeekStart: string;
  lastWeekEnd: string;
  thisMonth: string;
  nextMonth: string;
  lastMonth: string;
  thisWeekDueBefore: string;
  nextWeekDueBefore: string;
  thisMonthDueBefore: string;
  nextMonthDueBefore: string;
}

export function dateAnchors(now: Date = new Date()): DateAnchors {
  const day = (base: Date, n: number): Date => {
    const x = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
    x.setUTCDate(x.getUTCDate() + n);
    return x;
  };
  const iso = (d: Date): string => d.toISOString().slice(0, 10); // YYYY-MM-DD
  const month = (d: Date): string => d.toISOString().slice(0, 7); // YYYY-MM

  const today = day(now, 0);
  const dow = today.getUTCDay(); // 0 Sun .. 6 Sat
  const thisMon = day(today, dow === 0 ? -6 : 1 - dow); // Monday of this week
  const monthStart = (offset: number): Date =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));

  return {
    today: iso(today),
    tomorrow: iso(day(today, 1)),
    yesterday: iso(day(today, -1)),
    thisWeekStart: iso(thisMon),
    thisWeekEnd: iso(day(thisMon, 6)), // Sunday
    nextWeekStart: iso(day(thisMon, 7)),
    nextWeekEnd: iso(day(thisMon, 13)),
    lastWeekStart: iso(day(thisMon, -7)),
    lastWeekEnd: iso(day(thisMon, -1)),
    thisMonth: month(today),
    nextMonth: month(monthStart(1)),
    lastMonth: month(monthStart(-1)),
    thisWeekDueBefore: iso(day(thisMon, 7)), // next Monday (exclusive)
    nextWeekDueBefore: iso(day(thisMon, 14)),
    thisMonthDueBefore: iso(monthStart(1)),
    nextMonthDueBefore: iso(monthStart(2)),
  };
}

/**
 * Reusable instruction block listing the concrete anchors. Both the qna
 * task-query sub-agent and the planner specialist embed this so their date
 * handling stays identical.
 */
export function dateAnchorsPromptBlock(now: Date = new Date()): string {
  const a = dateAnchors(now);
  return `Current date reference (recomputed each session — use these exact values, do NOT
recompute or invent dates). Weeks start Monday; dueBefore is exclusive (due_at < dueBefore):
- today      = ${a.today}
- tomorrow   = ${a.tomorrow}
- yesterday  = ${a.yesterday}
- this week  = ${a.thisWeekStart} .. ${a.thisWeekEnd}  (dueBefore ${a.thisWeekDueBefore})
- next week  = ${a.nextWeekStart} .. ${a.nextWeekEnd}  (dueBefore ${a.nextWeekDueBefore})
- last week  = ${a.lastWeekStart} .. ${a.lastWeekEnd}
- this month = ${a.thisMonth}  (dueBefore ${a.thisMonthDueBefore})
- next month = ${a.nextMonth}  (dueBefore ${a.nextMonthDueBefore})
- last month = ${a.lastMonth}
For "due this week" pass dueBefore=${a.thisWeekDueBefore} to planner_queryTasks.`;
}
