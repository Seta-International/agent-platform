/** Monday..Sunday date range of an ISO week (Jan 4 is always in week 1). Shared by the
 * weekly-report domain and the reporter-assignment temporal port. */
export function isoWeekRange(iso_year: number, iso_week: number): { from: string; to: string } {
  const jan4 = new Date(Date.UTC(iso_year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (day - 1) + (iso_week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(monday), to: fmt(sunday) };
}

let clock: () => Date = () => new Date();
export function setWeeklyReportClock(next?: () => Date): void {
  clock = next ?? (() => new Date());
}

function currentVnIsoWeek(now: Date): { iso_year: number; iso_week: number } {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  const d = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const iso_year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(iso_year, 0, 1));
  const iso_week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { iso_year, iso_week };
}

export function getCurrentIsoWeek(): { iso_year: number; iso_week: number } {
  return currentVnIsoWeek(clock());
}

export function isWeekEditable(iso_year: number, iso_week: number): boolean {
  const now = clock();
  const current = currentVnIsoWeek(now);
  if (current.iso_year !== iso_year || current.iso_week !== iso_week) return false;
  const monday = new Date(`${isoWeekRange(iso_year, iso_week).from}T00:00:00Z`);
  const deadline = monday.getTime() + 4 * 86_400_000 + 10 * 3_600_000;
  return now.getTime() < deadline;
}
