export const roleAccessKeys = {
  all: ['identity', 'role-access'] as const,
  matrix: (module?: string) => [...roleAccessKeys.all, 'matrix', module ?? null] as const,
};
