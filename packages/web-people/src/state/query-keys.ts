import type { AllocationGridFilters } from '../api/allocation-client';
import type { WorkersQuery } from '../api/people-client';

export const peopleKeys = {
  all: ['people'] as const,
  workers: (query?: WorkersQuery) => [...peopleKeys.all, 'workers', query ?? {}] as const,
  worker: (id: string) => [...peopleKeys.all, 'worker', id] as const,
  history: (id: string) => [...peopleKeys.all, 'worker', id, 'history'] as const,
  orgStructure: () => [...peopleKeys.all, 'org', 'structure'] as const,
  orgDelivery: () => [...peopleKeys.all, 'org', 'delivery'] as const,
  orgCompany: () => [...peopleKeys.all, 'org', 'company'] as const,
  allocationGrid: (filters?: AllocationGridFilters) =>
    [...peopleKeys.all, 'allocation', 'grid', filters ?? {}] as const,
  allocationUtilization: (crossProject?: boolean) =>
    [...peopleKeys.all, 'allocation', 'utilization', { crossProject: !!crossProject }] as const,
};
