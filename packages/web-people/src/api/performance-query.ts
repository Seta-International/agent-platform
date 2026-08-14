import { queryOptions } from '@tanstack/react-query';
import { performanceKeys } from '../state/performance-query-keys.ts';
import {
  fetchCycleStatus,
  fetchCycleUnlockPanel,
  fetchMonthTasks,
  fetchPerformanceConfig,
  fetchPerformanceContext,
} from './people-client.ts';

/**
 * Current Performance cycle month (YYYY-MM) in Asia/Ho_Chi_Minh.
 * Must match `vnYearMonth` in `@seta/people` month-clock (web packages cannot import people).
 */
export function currentMonth(at: Date = new Date()): string {
  const vn = new Date(at.getTime() + 7 * 3_600_000);
  const y = vn.getUTCFullYear();
  const m = String(vn.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function performanceContextOptions(asOfMonth: string) {
  return queryOptions({
    queryKey: performanceKeys.context(asOfMonth),
    queryFn: () => fetchPerformanceContext(asOfMonth),
    staleTime: 5 * 60 * 1000, // identity/capacities are stable within a session
  });
}

export function cycleStatusOptions(month: string, accountId?: string | null) {
  return queryOptions({
    queryKey: performanceKeys.cycleStatus(month, accountId),
    queryFn: () => fetchCycleStatus(month, accountId),
    // Window flips on calendar boundaries — don't serve a stale open/makeup for a minute.
    staleTime: 0,
  });
}

export function cycleUnlockPanelOptions() {
  return queryOptions({
    queryKey: performanceKeys.cycleUnlocks(),
    queryFn: () => fetchCycleUnlockPanel(),
    staleTime: 0,
  });
}

export function monthTasksOptions(month: string) {
  return queryOptions({
    queryKey: performanceKeys.monthTasks(month),
    queryFn: () => fetchMonthTasks(month),
    staleTime: 0,
  });
}

export function performanceConfigOptions(accountId: string) {
  return queryOptions({
    queryKey: performanceKeys.config(accountId),
    queryFn: () => fetchPerformanceConfig(accountId),
    staleTime: 0,
  });
}
