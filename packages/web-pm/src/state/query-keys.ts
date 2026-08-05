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
  currentWeek: () => [...pmKeys.all, 'current-week'] as const,
  kpiNorm: () => [...pmKeys.all, 'kpi-norm'] as const,
  kpiAppliedMetrics: (projectIds: string[], week?: { iso_year: number; iso_week: number }) =>
    [...pmKeys.all, 'kpi-applied-metrics', [...projectIds].sort(), week ?? null] as const,
  kpiExplorer: (params: Record<string, unknown>) =>
    [...pmKeys.all, 'kpi-explorer', params] as const,
  kpiRecord: (params: Record<string, unknown>) => [...pmKeys.all, 'kpi-record', params] as const,
  weeklyReports: (params: Record<string, unknown>) =>
    [...pmKeys.all, 'weekly-reports', params] as const,
  weeklyReportDetail: (params: Record<string, unknown>) =>
    [...pmKeys.all, 'weekly-report-detail', params] as const,
};
