import { useQuery } from '@tanstack/react-query';
import { agentApi } from '../api/client';
import type { ThreadSummary } from '../api/schemas';

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

// Mastra's `generateTitle: true` writes the title asynchronously after the
// first assistant turn completes. We have no push signal for it, so the
// thread-list query itself polls — but only when there's actually something to
// wait for. The window starts when a row appears with `title: null` and stops
// either when the title lands or when the row is too old to plausibly still be
// generating (hard cap).
const TITLE_GEN_FRESHNESS_MS = 30_000;
const TITLE_POLL_INTERVAL_MS = 1500;

function shouldPollForTitle(threads: ThreadSummary[] | undefined): boolean {
  if (!threads) return false;
  const now = Date.now();
  return threads.some((t) => {
    if (t.title) return false;
    if (!t.updatedAt) return false;
    const age = now - new Date(t.updatedAt).getTime();
    return age >= 0 && age < TITLE_GEN_FRESHNESS_MS;
  });
}

export function useThreadList() {
  const q = useQuery({
    queryKey: ['agent', 'threads'],
    queryFn: () => agentApi.listThreads(),
    refetchInterval: (query) =>
      shouldPollForTitle(query.state.data) ? TITLE_POLL_INTERVAL_MS : false,
  });
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
