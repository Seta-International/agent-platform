import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useMemo } from 'react';
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

/**
 * (Project, Week) context for PM work screens (FUT-589):
 * - the week picker anchors on the SERVER's current week (Asia/Ho_Chi_Minh), so a viewer's
 *   browser timezone never shifts the default context;
 * - the context lives only in the URL, so it stays shareable and a link that carries it wins;
 * - a bare URL is the default context — all accounts, all projects, current week. Nothing is
 *   stashed across mounts: entering a screen from the sidebar starts from the default view.
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
