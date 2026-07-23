import type { ResolvedPerformanceScope } from './performance-scope.ts';
import { scopeTuple } from './performance-scope.ts';

/**
 * Query-key factory for Performance scoped reads (FE-AD-8).
 * Switching capacity changes the tuple → no cross-role cache merge (AC2).
 */
export const performanceKeys = {
  all: ['people', 'performance'] as const,
  context: (asOfMonth: string) => [...performanceKeys.all, 'context', asOfMonth] as const,
  section: (section: string, resolved: ResolvedPerformanceScope) =>
    [...performanceKeys.all, section, scopeTuple(resolved)] as const,
};
