export const hiringKeys = {
  all: ['hiring'] as const,
  // Open-positions board: `OpenRequisitionsBoard` (scope + requisitions), from fetchOpenRequisitions.
  // Carries every lifecycle status (incl. cancelled, FUT-878) so Board and List agree.
  requisitions: () => [...hiringKeys.all, 'requisitions'] as const,
  requisition: (id: string) => [...hiringKeys.all, 'requisition', id] as const,
  requisitionOptions: () => [...hiringKeys.requisitions(), 'options'] as const,
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
