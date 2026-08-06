export const hiringKeys = {
  all: ['hiring'] as const,
  // Open-positions board: `OpenRequisitionsBoard` (scope + requisitions), from fetchOpenRequisitions.
  // FUT-771: the Cancelled status filter fetches a widened board (includeCancelled), which is a
  // distinct cache entry. The extra segment is appended only for that variant, so bare
  // `requisitions()` invalidations still prefix-match both entries.
  requisitions: (includeCancelled = false) =>
    [
      ...hiringKeys.all,
      'requisitions',
      ...(includeCancelled ? (['with-cancelled'] as const) : []),
    ] as const,
  requisition: (id: string) => [...hiringKeys.all, 'requisition', id] as const,
  // Flat requisition list for pickers (candidate create/transfer), from fetchRequisitions.
  // Deliberately a distinct key from `requisitions()` above — same cache key, different response
  // shape (array vs board object) caused a runtime crash when both were read in one session (FUT-335).
  requisitionOptions: () => [...hiringKeys.all, 'requisition-options'] as const,
  jdTemplates: () => [...hiringKeys.all, 'jd-templates'] as const,
  closeReasons: () => [...hiringKeys.all, 'close-reasons'] as const,
  // FUT-833: `q` becomes part of the cache key so a debounced server-side search creates distinct
  // entries. Prefix-match invalidation (`hiringKeys.all`-scoped) still clears all `q` variants.
  candidates: (q = '') => [...hiringKeys.all, 'candidates', q] as const,
  rejectedCandidates: (q = '') => [...hiringKeys.all, 'rejected-candidates', q] as const,
  candidateStageCounts: () => [...hiringKeys.all, 'candidate-stage-counts'] as const,
  candidate: (id: string) => [...hiringKeys.all, 'candidate', id] as const,
  rejectionReasons: () => [...hiringKeys.all, 'rejection-reasons'] as const,
  skillCatalog: () => [...hiringKeys.all, 'skill-catalog'] as const,
  talentPool: (q = '') => [...hiringKeys.all, 'talent-pool', q] as const,
  accounts: () => [...hiringKeys.all, 'accounts'] as const,
  // id→name resolution for timeline attribution; keyed by the sorted id set.
  actorNames: (ids: string[]) => [...hiringKeys.all, 'actor-names', ...ids] as const,
  projects: (accountId?: string) => [...hiringKeys.all, 'projects', accountId ?? null] as const,
};
