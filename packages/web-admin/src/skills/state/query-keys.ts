export const skillKeys = {
  all: ['core', 'skills'] as const,
  categories: () => [...skillKeys.all, 'categories'] as const,
  skills: (categoryId?: string) => [...skillKeys.all, 'skills', categoryId ?? null] as const,
};
