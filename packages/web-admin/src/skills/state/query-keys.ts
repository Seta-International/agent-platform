export const skillKeys = {
  all: ['core', 'skills'] as const,
  categories: () => [...skillKeys.all, 'categories'] as const,
  skills: () => [...skillKeys.all, 'skills'] as const,
};
