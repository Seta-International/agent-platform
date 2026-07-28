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
  candidates: () => [...hiringKeys.all, 'candidates'] as const,
  rejectedCandidates: () => [...hiringKeys.all, 'rejected-candidates'] as const,
  candidateStageCounts: () => [...hiringKeys.all, 'candidate-stage-counts'] as const,
  candidate: (id: string) => [...hiringKeys.all, 'candidate', id] as const,
  rejectionReasons: () => [...hiringKeys.all, 'rejection-reasons'] as const,
  skillCatalog: () => [...hiringKeys.all, 'skill-catalog'] as const,
  talentPool: () => [...hiringKeys.all, 'talent-pool'] as const,
  accounts: () => [...hiringKeys.all, 'accounts'] as const,
  // id→name resolution for timeline attribution; keyed by the sorted id set.
  actorNames: (ids: string[]) => [...hiringKeys.all, 'actor-names', ...ids] as const,
  projects: (accountId?: string) => [...hiringKeys.all, 'projects', accountId ?? null] as const,
};
