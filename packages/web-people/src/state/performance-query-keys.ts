import type { ResolvedPerformanceScope } from './performance-scope.ts';
import { scopeTuple } from './performance-scope.ts';

/**
 * Query-key factory for Performance scoped reads (FE-AD-8).
 * Switching capacity changes the tuple → no cross-role cache merge (AC2).
 */
export const performanceKeys = {
  all: ['people', 'performance'] as const,
  context: (asOfMonth: string) => [...performanceKeys.all, 'context', asOfMonth] as const,
  cycleStatus: (month: string, accountId?: string | null) =>
    [...performanceKeys.all, 'cycleStatus', month, accountId ?? null] as const,
  cycleUnlocks: () => [...performanceKeys.all, 'cycleUnlocks'] as const,
  monthTasks: (month: string) => [...performanceKeys.all, 'monthTasks', month] as const,
  config: (accountId: string) => [...performanceKeys.all, 'config', accountId] as const,
  rollup: (month: string, scope: string, targetId?: string | null) =>
    [...performanceKeys.all, 'rollup', month, scope, targetId ?? null] as const,
  section: (section: string, resolved: ResolvedPerformanceScope) =>
    [...performanceKeys.all, section, scopeTuple(resolved)] as const,
};
