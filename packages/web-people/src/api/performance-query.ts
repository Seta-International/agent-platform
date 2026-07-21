import { queryOptions } from '@tanstack/react-query';
import type { PerformanceScope } from '../lib/performance-scope.ts';
import { fetchPerformanceContext } from './people-client.ts';

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function performanceContextOptions(asOfMonth: string) {
  return queryOptions({
    queryKey: ['people', 'performance', 'context', asOfMonth],
    queryFn: () => fetchPerformanceContext(asOfMonth),
    staleTime: 5 * 60 * 1000, // identity/capacities are stable within a session
  });
}

/**
 * Cache-key tuple for scope-dependent queries (AC2): capacity kind + id +
 * month are all part of the key, so TanStack Query can never merge data
 * across capacities or months. Every Performance section query must spread
 * this as its key prefix.
 */
export function performanceScopeKey(scope: PerformanceScope): readonly unknown[] {
  const id = scope.capacity.kind === 'am' ? scope.capacity.account_id : scope.capacity.project_id;
  return ['people', 'performance', 'scope', scope.capacity.kind, id, scope.as_of_month] as const;
}
