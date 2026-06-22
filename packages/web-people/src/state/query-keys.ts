import type { WorkersQuery } from '../api/people-client';

export const peopleKeys = {
  all: ['people'] as const,
  workers: (query?: WorkersQuery) => [...peopleKeys.all, 'workers', query ?? {}] as const,
  worker: (id: string) => [...peopleKeys.all, 'worker', id] as const,
  history: (id: string) => [...peopleKeys.all, 'worker', id, 'history'] as const,
  orgStructure: () => [...peopleKeys.all, 'org', 'structure'] as const,
  orgDelivery: () => [...peopleKeys.all, 'org', 'delivery'] as const,
  orgCompany: () => [...peopleKeys.all, 'org', 'company'] as const,
  allocationGrid: (year?: number) =>
    [...peopleKeys.all, 'allocation', 'grid', year ?? 'current'] as const,
};
