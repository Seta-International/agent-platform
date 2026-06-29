export function relativeTime(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 0) return 'in the future';
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
