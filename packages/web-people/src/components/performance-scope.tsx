import { EmptyState } from '@seta/shared-ui';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import type { PerformanceContext } from '../api/people-client.ts';
import {
  type CapacityRef,
  encodeCapacity,
  entitledSections,
  type PerformanceScope,
  type PerformanceSection,
  resolveScope,
} from '../lib/performance-scope.ts';

type OkContext = Extract<PerformanceContext, { status: 'ok' }>;

export interface PerformanceScopeValue {
  context: OkContext;
  /** Resolved from URL search params every render — never copied into state. */
  scope: PerformanceScope | null;
  sections: Set<PerformanceSection>;
  setCapacity: (capacity: CapacityRef) => void;
}

const ScopeContext = createContext<PerformanceScopeValue | null>(null);

/**
 * Single read-through from the URL to the scope tuple (AC3/AC4): the URL is
 * the only source of context. Setters navigate; nothing here holds state.
 */
export function PerformanceScopeProvider({
  context,
  children,
}: {
  context: OkContext;
  children: ReactNode;
}) {
  const search = useSearch({ strict: false }) as { capacity?: string; month?: string };
  const navigate = useNavigate();

  const value = useMemo<PerformanceScopeValue>(
    () => ({
      context,
      scope: resolveScope(search, context),
      sections: entitledSections(context),
      setCapacity: (capacity) =>
        void navigate({
          to: '.',
          search: (prev: Record<string, unknown>) => ({
            ...prev,
            capacity: encodeCapacity(capacity),
          }),
        }),
    }),
    [context, search, navigate],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function usePerformanceScope(): PerformanceScopeValue {
  const value = useContext(ScopeContext);
  if (!value) throw new Error('usePerformanceScope must be used inside PerformanceScopeProvider');
  return value;
}

/**
 * Section-level affordance guard (AC1): hides unentitled section bodies with
 * a dedicated in-surface state — deliberately not the app-wide /403 screen.
 * Server-side RBAC on each section's API remains the real authorization.
 */
export function SectionGuard({
  section,
  children,
}: {
  section: PerformanceSection;
  children: ReactNode;
}) {
  const { sections } = usePerformanceScope();
  if (!sections.has(section)) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <EmptyState
          title="No access to this section"
          description="Your current role doesn't include this part of Performance."
        />
      </div>
    );
  }
  return <>{children}</>;
}
