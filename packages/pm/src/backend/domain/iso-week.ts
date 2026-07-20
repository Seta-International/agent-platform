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
