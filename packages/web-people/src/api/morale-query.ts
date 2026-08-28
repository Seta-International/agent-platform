import { queryOptions } from '@tanstack/react-query';
import { moraleKeys } from '../state/morale-query-keys.ts';
import type { MoraleHistoryRange, MoraleInboxFilters, MoraleTrendRange } from './people-client.ts';
import {
  fetchMoraleHistory,
  fetchMoraleInbox,
  fetchMoraleInboxFilters,
  fetchMoraleRecipients,
  fetchMoraleTrend,
} from './people-client.ts';

/**
 * Keyed by project so switching the picker swaps to that project's Team Lead and Account
 * Manager rather than mutating one shared cache entry — going back to a project the
 * sender already viewed is then instant, and no request can land on the wrong project.
 */
export function moraleRecipientsOptions(projectId: string | null = null) {
  return queryOptions({
    queryKey: moraleKeys.recipientsFor(projectId),
    queryFn: () => fetchMoraleRecipients(projectId),
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

export function moraleInboxOptions(filters: MoraleInboxFilters = {}) {
  return queryOptions({
    queryKey: moraleKeys.inboxFor(filters),
    queryFn: () => fetchMoraleInbox(filters),
    // Notes arrive whenever someone writes one, not on a cycle, so the default
    // refetch-on-focus is what keeps an inbox left open overnight honest.
  });
}

export function moraleInboxFiltersOptions(window: Pick<MoraleInboxFilters, 'from' | 'to'> = {}) {
  return queryOptions({
    queryKey: moraleKeys.inboxFilters(window),
    queryFn: () => fetchMoraleInboxFilters(window),
    // Held briefly: the pickers are re-read on every keystroke in the list, and a new
    // sender appearing mid-session is not worth a request per interaction.
    staleTime: 60 * 1000,
  });
}

export function moraleTrendOptions(range: MoraleTrendRange = {}) {
  return queryOptions({
    queryKey: moraleKeys.trend(range),
    queryFn: () => fetchMoraleTrend(range),
    // A month's average moves only when someone submits, and the aggregate is monthly.
    staleTime: 5 * 60 * 1000,
  });
}
