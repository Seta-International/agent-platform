export interface EffortWindow {
  from?: string;
  to?: string;
}

function ym(date: string): number {
  const [y, m] = date.split('-');
  return Number(y) * 12 + (Number(m) - 1);
}

export function clippedCalendarEffort(
  row: { date_from: string | null; date_to: string | null; planned_pct: number | null },
  win: EffortWindow,
): number {
  const effectiveFrom = row.date_from ?? win.from;
  if (!effectiveFrom) return 0;
  // No end date means the allocation is still ongoing — treat it as running through
  // the end of the window rather than dropping it from the calculation entirely.
  const effectiveTo = row.date_to ?? win.to;
  if (!effectiveTo) return 0;
  const from = win.from && win.from > effectiveFrom ? win.from : effectiveFrom;
  const to = win.to && win.to < effectiveTo ? win.to : effectiveTo;
  const months = ym(to) - ym(from) + 1;
  if (months <= 0) return 0;
  const frac = (row.planned_pct ?? 0) / 100;
  return Math.round(months * frac * 100) / 100;
}

interface CapacityRow {
  date_from: string | null;
  date_to: string | null;
  planned_pct: number | null;
}

/**
 * Peak concurrent planned_pct (0-100 scale) across a single worker's segments,
 * clipped to the window. A missing end date means the allocation is still
 * ongoing, so it's treated as running through the end of the window rather
 * than being dropped — otherwise an open-ended 100% booking would silently
 * never count toward over-allocation. Concurrency maxes out at some segment's
 * start, so sampling those points is sufficient.
 */
export function peakConcurrentPct(rows: CapacityRow[], win: EffortWindow): number {
  const segs: Array<{ from: string; to: string; pct: number }> = [];
  for (const r of rows) {
    const effectiveFrom = r.date_from ?? win.from;
    if (!effectiveFrom) continue;
    const effectiveTo = r.date_to ?? win.to;
    if (!effectiveTo) continue;
    const from = win.from && win.from > effectiveFrom ? win.from : effectiveFrom;
    const to = win.to && win.to < effectiveTo ? win.to : effectiveTo;
    if (from > to) continue;
    segs.push({ from, to, pct: r.planned_pct ?? 0 });
  }
  let peak = 0;
  for (const s of segs) {
    let sum = 0;
    for (const t of segs) {
      if (t.from <= s.from && s.from <= t.to) sum += t.pct;
    }
    if (sum > peak) peak = sum;
  }
  return peak;
}

/** Worker ids whose peak concurrent allocation exceeds 100% within the window. */
export function overAllocatedWorkers(
  rows: Array<CapacityRow & { worker_id: string | null }>,
  win: EffortWindow,
): Set<string> {
  const byWorker = new Map<string, CapacityRow[]>();
  for (const r of rows) {
    if (!r.worker_id) continue;
    const list = byWorker.get(r.worker_id);
    if (list) list.push(r);
    else byWorker.set(r.worker_id, [r]);
  }
  const over = new Set<string>();
  for (const [wid, rs] of byWorker) {
    if (peakConcurrentPct(rs, win) > 100) over.add(wid);
  }
  return over;
}

export interface RaKpis {
  total_mm: number;
  billable_mm: number;
  billable_pct: number;
  people: number;
}

export function rollupKpis(
  rows: Array<{
    date_from: string | null;
    date_to: string | null;
    planned_pct: number | null;
    bucket: string;
    worker_id: string | null;
  }>,
  win: EffortWindow,
): RaKpis {
  let total = 0;
  let billable = 0;
  const people = new Set<string>();
  for (const r of rows) {
    const e = clippedCalendarEffort(r, win);
    total += e;
    if (r.bucket === 'billable') billable += e;
    if (r.worker_id) people.add(r.worker_id);
  }
  total = Math.round(total * 100) / 100;
  billable = Math.round(billable * 100) / 100;
  return {
    total_mm: total,
    billable_mm: billable,
    billable_pct: total ? Math.round((billable / total) * 100) : 0,
    people: people.size,
  };
}
