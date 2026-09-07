import type {
  MoraleHistoryRange,
  MoraleInboxFilters,
  MoraleTrendRange,
} from '../api/people-client.ts';

export const moraleKeys = {
  all: ['people', 'morale'] as const,
  /** Every per-project recipient list shares this prefix, so one invalidate covers all. */
  recipients: () => [...moraleKeys.all, 'recipients'] as const,
  recipientsFor: (projectId: string | null) => [...moraleKeys.recipients(), projectId] as const,
  /** Every history window shares this prefix, so one invalidate covers all filters. */
  history: () => [...moraleKeys.all, 'history'] as const,
  historyFor: (range: MoraleHistoryRange) =>
    [...moraleKeys.history(), range.from ?? null, range.to ?? null] as const,
  /** Same prefix rule for the recipient inbox: marking one note read refreshes every view. */
  inbox: () => [...moraleKeys.all, 'inbox'] as const,
  inboxFor: (filters: MoraleInboxFilters) =>
    [
      ...moraleKeys.inbox(),
      filters.from ?? null,
      filters.to ?? null,
      filters.project_id ?? null,
      filters.sender_person_id ?? null,
      filters.unread_only ?? false,
    ] as const,
  /**
   * Keyed on the window alone. The option lists narrow each other in the client, so
   * changing a picker must not refetch the very list it is narrowing.
   */
  inboxFilters: (window: Pick<MoraleInboxFilters, 'from' | 'to'>) =>
    [...moraleKeys.all, 'inbox-filters', window.from ?? null, window.to ?? null] as const,
  trend: (range: MoraleTrendRange) =>
    [...moraleKeys.all, 'trend', range.from_month ?? null, range.to_month ?? null] as const,
};
