export const groupKeys = {
  all: ['identity', 'groups'] as const,
  list: () => [...groupKeys.all, 'list'] as const,
  userGroups: (userId: string) => [...groupKeys.all, 'user', userId] as const,
};
