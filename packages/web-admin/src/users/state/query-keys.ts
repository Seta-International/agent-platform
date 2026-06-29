export const directoryKeys = {
  all: ['identity', 'directory'] as const,
  list: (p: { search?: string; status?: string; page?: number }) =>
    [...directoryKeys.all, 'list', p.search ?? '', p.status ?? '', p.page ?? 0] as const,
};
