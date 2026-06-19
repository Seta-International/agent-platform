export const peopleKeys = {
  all: ['people'] as const,
  workers: () => [...peopleKeys.all, 'workers'] as const,
  worker: (id: string) => [...peopleKeys.all, 'worker', id] as const,
  history: (id: string) => [...peopleKeys.all, 'worker', id, 'history'] as const,
};
