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
  if (!row.date_from || !row.date_to) return 0;
  const from = win.from && win.from > row.date_from ? win.from : row.date_from;
  const to = win.to && win.to < row.date_to ? win.to : row.date_to;
  const months = ym(to) - ym(from) + 1;
  if (months <= 0) return 0;
  const frac = (row.planned_pct ?? 0) / 100;
  return Math.round(months * frac * 10) / 10;
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
  total = Math.round(total * 10) / 10;
  billable = Math.round(billable * 10) / 10;
  return {
    total_mm: total,
    billable_mm: billable,
    billable_pct: total ? Math.round((billable / total) * 100) : 0,
    people: people.size,
  };
}
