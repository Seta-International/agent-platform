import type { WorkersQuery } from '../api/people-client';

export const peopleKeys = {
  all: ['people'] as const,
  workers: (query?: WorkersQuery) => [...peopleKeys.all, 'workers', query ?? {}] as const,
  worker: (id: string) => [...peopleKeys.all, 'worker', id] as const,
  history: (id: string) => [...peopleKeys.all, 'worker', id, 'history'] as const,
};
