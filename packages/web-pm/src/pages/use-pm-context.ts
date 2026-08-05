import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useMemo, useRef } from 'react';
import { fetchCurrentWeek } from '../api/pm-client.ts';
import { pmKeys } from '../state/query-keys.ts';
import { recentIsoWeeks } from './kpi-shared.tsx';

/** The (Project, Week) context every PM work screen operates under (FUT-589). */
export interface PmContextSearch {
  account?: string;
  project?: string;
  iso_year?: number;
  iso_week?: number;
}

const STORAGE_KEY = 'pm.context';

function readStored(): PmContextSearch | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as PmContextSearch;
    return typeof ctx === 'object' && ctx !== null ? ctx : null;
  } catch {
    return null;
  }
}

/**
 * Shared (Project, Week) context for PM work screens (FUT-589):
 * - the week picker anchors on the SERVER's current week (Asia/Ho_Chi_Minh), so a viewer's
 *   browser timezone never shifts the default context;
 * - the context lives in the URL (shareable) and is mirrored to sessionStorage, so moving
 *   between Weekly Reports and KPI Metrics keeps the same Project + Week;
 * - a bare URL (no context params) restores the stored context once on mount.
 */
export function usePmContext(route: string) {
  const search = useSearch({ strict: false }) as PmContextSearch & Record<string, unknown>;
  const navigate = useNavigate();

  const currentWeekQuery = useQuery({
    queryKey: pmKeys.currentWeek(),
    queryFn: fetchCurrentWeek,
    staleTime: 60_000,
  });
  const weeks = useMemo(
    () => recentIsoWeeks(currentWeekQuery.data ?? null),
    [currentWeekQuery.data],
  );
  const current = weeks[0];
  const iso_year = search.iso_year ?? current?.iso_year ?? new Date().getUTCFullYear();
  const iso_week = search.iso_week ?? current?.iso_week ?? 1;

  // Restore the cross-screen context exactly once, and only onto a bare URL — an explicit
  // (shared) URL always wins over whatever this browser tab did last.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const hasContext =
      search.iso_year !== undefined ||
      search.iso_week !== undefined ||
      search.account !== undefined ||
      search.project !== undefined;
    if (hasContext) return;
    const stored = readStored();
    if (!stored) return;
    void navigate({ to: route, search: { ...search, ...stored }, replace: true });
  }, [navigate, route, search]);

  useEffect(() => {
    const ctx: PmContextSearch = {
      account: search.account,
      project: search.project,
      iso_year: search.iso_year,
      iso_week: search.iso_week,
    };
    if (Object.values(ctx).every((v) => v === undefined)) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
    } catch {
      // storage unavailable (private mode) — context still lives in the URL
    }
  }, [search.account, search.project, search.iso_year, search.iso_week]);

  const setSearch = (patch: Partial<PmContextSearch> & Record<string, unknown>) =>
    void navigate({ to: route, search: { ...search, ...patch }, replace: true });

  return {
    search,
    setSearch,
    weeks,
    iso_year,
    iso_week,
    weekReady: currentWeekQuery.isSuccess,
  };
}
