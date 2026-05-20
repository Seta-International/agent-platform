export function formatRelative(
  d: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (d == null) return '—';
  const t = d instanceof Date ? d : new Date(d);
  const s = Math.max(0, (now.getTime() - t.getTime()) / 1000);
  if (s < 30) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  if (s < 30 * 86_400) return `${Math.floor(s / (7 * 86_400))}w`;
  if (s < 365 * 86_400) return `${Math.floor(s / (30 * 86_400))}mo`;
  return `${Math.floor(s / (365 * 86_400))}y`;
}
