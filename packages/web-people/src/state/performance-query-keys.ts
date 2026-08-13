import type { ResolvedPerformanceScope } from './performance-scope.ts';
import { scopeTuple } from './performance-scope.ts';

/**
 * Query-key factory for Performance scoped reads (FE-AD-8).
 * Switching capacity changes the tuple → no cross-role cache merge (AC2).
 */
export const performanceKeys = {
  all: ['people', 'performance'] as const,
  context: (asOfMonth: string) => [...performanceKeys.all, 'context', asOfMonth] as const,
  cycleStatus: (month: string) => [...performanceKeys.all, 'cycleStatus', month] as const,
  cycleUnlocks: (month: string) => [...performanceKeys.all, 'cycleUnlocks', month] as const,
  monthTasks: (month: string) => [...performanceKeys.all, 'monthTasks', month] as const,
  config: (accountId: string) => [...performanceKeys.all, 'config', accountId] as const,
  section: (section: string, resolved: ResolvedPerformanceScope) =>
    [...performanceKeys.all, section, scopeTuple(resolved)] as const,
};
