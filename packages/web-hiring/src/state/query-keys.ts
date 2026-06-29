export const hiringKeys = {
  all: ['hiring'] as const,
  requisitions: () => [...hiringKeys.all, 'requisitions'] as const,
  requisition: (id: string) => [...hiringKeys.all, 'requisition', id] as const,
  jdTemplates: () => [...hiringKeys.all, 'jd-templates'] as const,
  closeReasons: () => [...hiringKeys.all, 'close-reasons'] as const,
  candidates: () => [...hiringKeys.all, 'candidates'] as const,
  candidate: (id: string) => [...hiringKeys.all, 'candidate', id] as const,
  rejectionReasons: () => [...hiringKeys.all, 'rejection-reasons'] as const,
  skillCatalog: () => [...hiringKeys.all, 'skill-catalog'] as const,
  talentPool: () => [...hiringKeys.all, 'talent-pool'] as const,
};
