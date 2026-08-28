import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef } from 'react';
import type { PerformanceCapacity } from '../api/people-client.ts';
import {
  hasExplicitScope,
  type PerformanceScopeSearch,
  parsePerformanceSearch,
  type ResolvedPerformanceScope,
  resolvePerformanceScope,
  searchFromCapacity,
  searchFromOrg,
} from '../state/performance-scope.ts';

const STORAGE_KEY = 'people.performance.context';

function readStored(): PerformanceScopeSearch | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as PerformanceScopeSearch;
    return typeof ctx === 'object' && ctx !== null ? parsePerformanceSearch(ctx) : null;
  } catch {
    return null;
  }
}

export type UsePerformanceScopeArgs = {
  /** Current path to navigate (e.g. /people/performance/configuration) — preserves section. */
  pathname: string;
  capacities: readonly PerformanceCapacity[];
  default_capacity_index: number;
  /** Session holds people.performance.read_org — enables the explicit org view (FUT-781). */
  can_view_org: boolean;
  as_of_month: string;
};

/**
 * Capacity + month context for the Performance surface (FUT-693):
 * - URL search params are the single source of truth (FE-AD-13);
 * - bare URL restores sessionStorage once; an explicit (shared) URL always wins;
 * - invalid / forged capacity tuples fall back to default_capacity_index.
 *
 * Bootstrap is a single effect so restore cannot race a default-capacity write
 * (which would clobber the last dual-role selection on a bare `/performance` visit).
 */
export function usePerformanceScope({
  pathname,
  capacities,
  default_capacity_index,
  can_view_org,
  as_of_month,
}: UsePerformanceScopeArgs): {
  search: PerformanceScopeSearch;
  resolved: ResolvedPerformanceScope;
  setCapacity: (c: PerformanceCapacity) => void;
  setOrg: () => void;
  setSearch: (patch: Partial<PerformanceScopeSearch>) => void;
} {
  const rawSearch = useSearch({ strict: false }) as Record<string, unknown>;
  const search = useMemo(() => parsePerformanceSearch(rawSearch), [rawSearch]);
  const navigate = useNavigate();

  const {
    resolved,
    search: canonical,
    corrected,
  } = useMemo(
    () =>
      resolvePerformanceScope({
        search,
        capacities,
        default_capacity_index,
        as_of_month,
        can_view_org,
      }),
    [search, capacities, default_capacity_index, as_of_month, can_view_org],
  );

  const bootstrapped = useRef(false);
  useEffect(() => {
    // Don't rewrite search onto a non-Performance URL while this hook is
    // briefly still mounted during route exit.
    if (!pathname.startsWith('/people/performance')) return;
    if (bootstrapped.current) return;

    // Bare URL: restore last context first; only then fall back to default capacity.
    if (!hasExplicitScope(search)) {
      const stored = readStored();
      if (stored && hasExplicitScope(stored)) {
        bootstrapped.current = true;
        void navigate({
          to: pathname as '/',
          search: { ...rawSearch, ...stored },
          replace: true,
        });
        return;
      }
      bootstrapped.current = true;
      void navigate({
        to: pathname as '/',
        search: { ...rawSearch, ...canonical },
        replace: true,
      });
      return;
    }

    // Explicit (shared) URL wins — only rewrite when forged/incomplete.
    bootstrapped.current = true;
    if (!corrected) return;
    void navigate({
      to: pathname as '/',
      search: { ...rawSearch, ...canonical },
      replace: true,
    });
  }, [canonical, corrected, navigate, pathname, rawSearch, search]);

  // Mirror only after the URL carries an explicit scope — never overwrite storage
  // while still on a bare URL mid-bootstrap.
  useEffect(() => {
    if (!hasExplicitScope(search)) return;
    if (resolved.mode === 'organization') {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ month: resolved.month }));
      } catch {
        /* private mode */
      }
      return;
    }
    if (!resolved.capacity) return;
    const ctx = searchFromCapacity(resolved.capacity, resolved.month);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
    } catch {
      /* private mode */
    }
  }, [resolved, search]);

  const setSearch = (patch: Partial<PerformanceScopeSearch>) => {
    void navigate({
      to: pathname as '/',
      search: { ...rawSearch, ...search, ...patch },
      replace: true,
    });
  };

  const setCapacity = (c: PerformanceCapacity) => {
    setSearch(searchFromCapacity(c, resolved.month));
  };

  const setOrg = () => {
    setSearch(searchFromOrg(resolved.month));
  };

  return { search: canonical, resolved, setCapacity, setOrg, setSearch };
}
