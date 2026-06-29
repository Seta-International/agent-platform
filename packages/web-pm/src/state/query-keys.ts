export const pmKeys = {
  all: ['pm'] as const,
  accounts: () => [...pmKeys.all, 'accounts'] as const,
  account: (id: string) => [...pmKeys.all, 'account', id] as const,
  charters: () => [...pmKeys.all, 'charters'] as const,
  chartersList: (params: Record<string, unknown>) =>
    [...pmKeys.all, 'charters', 'list', params] as const,
  charterSummary: () => [...pmKeys.all, 'charters', 'summary'] as const,
  charter: (id: string) => [...pmKeys.all, 'charter', id] as const,
  projects: () => [...pmKeys.all, 'projects'] as const,
  project: (id: string) => [...pmKeys.all, 'project', id] as const,
  staffingPlan: (id: string) => [...pmKeys.all, 'project', id, 'staffing-plan'] as const,
  projectAccess: (id: string) => [...pmKeys.all, 'project', id, 'access'] as const,
  projectAllocations: (id: string) => [...pmKeys.all, 'project', id, 'allocations'] as const,
  allocations: (params: Record<string, unknown>) => [...pmKeys.all, 'allocations', params] as const,
  workersByIds: (ids: string[]) => [...pmKeys.all, 'workers-by-ids', [...ids].sort()] as const,
};
