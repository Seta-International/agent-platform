export const pmKeys = {
  all: ['pm'] as const,
  accounts: () => [...pmKeys.all, 'accounts'] as const,
  account: (id: string) => [...pmKeys.all, 'account', id] as const,
};
