import type { MoraleHistoryRange } from '../api/people-client.ts';

export const moraleKeys = {
  all: ['people', 'morale'] as const,
  /** Every per-project recipient list shares this prefix, so one invalidate covers all. */
  recipients: () => [...moraleKeys.all, 'recipients'] as const,
  recipientsFor: (projectId: string | null) => [...moraleKeys.recipients(), projectId] as const,
  /** Every history window shares this prefix, so one invalidate covers all filters. */
  history: () => [...moraleKeys.all, 'history'] as const,
  historyFor: (range: MoraleHistoryRange) =>
    [...moraleKeys.history(), range.from ?? null, range.to ?? null] as const,
};
