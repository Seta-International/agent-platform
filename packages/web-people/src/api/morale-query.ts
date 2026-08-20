import { queryOptions } from '@tanstack/react-query';
import { moraleKeys } from '../state/morale-query-keys.ts';
import type { MoraleHistoryRange } from './people-client.ts';
import { fetchMoraleHistory, fetchMoraleRecipients } from './people-client.ts';

export function moraleRecipientsOptions() {
  return queryOptions({
    queryKey: moraleKeys.recipients(),
    queryFn: () => fetchMoraleRecipients(),
    // People leave and change roles; a stale list would let the sender pick someone
    // the server will reject at submit time.
    staleTime: 60 * 1000,
  });
}

export function moraleHistoryOptions(range: MoraleHistoryRange = {}) {
  return queryOptions({
    queryKey: moraleKeys.historyFor(range),
    queryFn: () => fetchMoraleHistory(range),
    // No staleTime override on purpose: the list only changes when this user submits,
    // and that path invalidates the key directly. The client default (refetch on focus)
    // is the right fallback for a note submitted from another tab.
  });
}
