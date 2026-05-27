import { useQuery } from '@tanstack/react-query';
import { agentApi } from '../api/client';

function bucket(updatedAt: Date): 'Today' | 'Earlier this week' | 'Older' {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (updatedAt.getTime() >= startOfToday) return 'Today';
  if (updatedAt.getTime() >= startOfToday - 7 * 86400_000) return 'Earlier this week';
  return 'Older';
}

function relativeLabel(updatedAt: Date): string {
  const deltaMs = Date.now() - updatedAt.getTime();
  if (deltaMs < 60_000) return 'just now';
  if (deltaMs < 3600_000) return `${Math.floor(deltaMs / 60_000)}m`;
  if (deltaMs < 86400_000) return `${Math.floor(deltaMs / 3600_000)}h`;
  return `${Math.floor(deltaMs / 86400_000)}d`;
}

export function useThreadList() {
  const q = useQuery({ queryKey: ['agent', 'threads'], queryFn: () => agentApi.listThreads() });
  const groups = q.data?.length
    ? (() => {
        type BucketKey = 'Today' | 'Earlier this week' | 'Older';
        type BucketItem = { id: string; title: string; updatedAtLabel: string };
        const buckets: { [K in BucketKey]: BucketItem[] } = {
          Today: [],
          'Earlier this week': [],
          Older: [],
        };
        for (const t of q.data) {
          const u = new Date(t.updatedAt);
          buckets[bucket(u)].push({
            id: t.id,
            title: t.title ?? 'Untitled',
            updatedAtLabel: relativeLabel(u),
          });
        }
        const keys: BucketKey[] = ['Today', 'Earlier this week', 'Older'];
        return keys.flatMap((k) =>
          buckets[k].length > 0 ? [{ label: k, items: buckets[k] }] : [],
        );
      })()
    : undefined;
  return { ...q, groups };
}
