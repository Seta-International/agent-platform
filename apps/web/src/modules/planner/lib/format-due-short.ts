const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const monthDayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const monthDayYearFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatDueShort(iso: string, now: Date = new Date()): string {
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return iso;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.round((startOfDue - startOfToday) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days < 0 && days >= -6) return `${-days}d ago`;
  if (days > 0 && days <= 6) return weekdayFmt.format(due);
  if (due.getFullYear() === now.getFullYear()) return monthDayFmt.format(due);
  return monthDayYearFmt.format(due);
}
