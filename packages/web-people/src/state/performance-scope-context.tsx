import { createContext, type ReactNode, useContext } from 'react';
import type { PerformanceCapacity } from '../api/people-client.ts';
import type {
  PerformanceScopeSearch,
  ResolvedPerformanceScope,
} from '../state/performance-scope.ts';

export type PerformanceScopeContextValue = {
  role_slugs: readonly string[];
  capacities: readonly PerformanceCapacity[];
  /** Session holds people.performance.read_org — gates the org (strategic/PMO) view. */
  can_view_org: boolean;
  resolved: ResolvedPerformanceScope;
  search: PerformanceScopeSearch;
  /** Change the active cycle month (YYYY-MM), keeping the capacity context. */
  setMonth: (month: string) => void;
};

const PerformanceScopeContext = createContext<PerformanceScopeContextValue | null>(null);

export function PerformanceScopeProvider({
  value,
  children,
}: {
  value: PerformanceScopeContextValue;
  children: ReactNode;
}) {
  return (
    <PerformanceScopeContext.Provider value={value}>{children}</PerformanceScopeContext.Provider>
  );
}

export function usePerformanceScopeContext(): PerformanceScopeContextValue {
  const ctx = useContext(PerformanceScopeContext);
  if (!ctx) {
    throw new Error('usePerformanceScopeContext must be used within PerformanceShell');
  }
  return ctx;
}
