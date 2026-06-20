export const pmKeys = {
  all: ['pm'] as const,
  accounts: () => [...pmKeys.all, 'accounts'] as const,
  account: (id: string) => [...pmKeys.all, 'account', id] as const,
  charters: () => [...pmKeys.all, 'charters'] as const,
  charter: (id: string) => [...pmKeys.all, 'charter', id] as const,
  projects: () => [...pmKeys.all, 'projects'] as const,
  project: (id: string) => [...pmKeys.all, 'project', id] as const,
};
