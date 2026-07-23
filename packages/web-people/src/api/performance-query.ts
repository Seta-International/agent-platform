import { queryOptions } from '@tanstack/react-query';
import { performanceKeys } from '../state/performance-query-keys.ts';
import { fetchPerformanceContext } from './people-client.ts';

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function performanceContextOptions(asOfMonth: string) {
  return queryOptions({
    queryKey: performanceKeys.context(asOfMonth),
    queryFn: () => fetchPerformanceContext(asOfMonth),
    staleTime: 5 * 60 * 1000, // identity/capacities are stable within a session
  });
}
