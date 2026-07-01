import type { DirectoryFilters } from '../api/directory-client.ts';

export const directoryKeys = {
  all: ['identity', 'directory'] as const,
  list: (p: DirectoryFilters) =>
    [
      ...directoryKeys.all,
      'list',
      p.search ?? '',
      p.status ?? '',
      p.employment ?? '',
      p.group_id ?? '',
      p.page ?? 0,
      p.pageSize ?? 0,
    ] as const,
};
