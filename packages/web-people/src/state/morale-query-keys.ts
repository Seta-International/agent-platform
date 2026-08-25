import type { MoraleHistoryRange } from '../api/people-client.ts';

export const moraleKeys = {
  all: ['people', 'morale'] as const,
  recipients: () => [...moraleKeys.all, 'recipients'] as const,
  /** Every history window shares this prefix, so one invalidate covers all filters. */
  history: () => [...moraleKeys.all, 'history'] as const,
  historyFor: (range: MoraleHistoryRange) =>
    [...moraleKeys.history(), range.from ?? null, range.to ?? null] as const,
};
