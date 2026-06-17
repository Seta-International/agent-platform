import type { TaskWithAssigneesRow } from '@seta/planner';
import {
  keepPreviousData,
  type QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { plannerClient } from '../../api/planner-client';
import { apiFrom, apiTo } from '../../lib/calendar-dates';
import { plannerKeys } from '../../state/query-keys';

export const CALENDAR_PAGE_SIZE = 50;
const CALENDAR_STALE_TIME = 30_000;

export interface CalendarTasksPage {
  tasks: TaskWithAssigneesRow[];
  next_cursor?: string;
  total_count: number;
}

/**
 * Pages are keyset-cursored on the server but addressed by number in the URL
 * (`calPage`). Page N's cursor comes from page N-1, so the fetcher ensures all
 * previous pages exist in the cache first. Each page is cached per
 * (planId, from, to, page) — back-navigation and earlier ranges resolve
 * instantly without refetching the chain (AC-6, AC-7, AC-8).
 */
async function fetchCalendarPage(
  qc: QueryClient,
  planId: string,
  from: string,
  to: string,
  page: number,
): Promise<CalendarTasksPage> {
  let cursor: string | undefined;
  if (page > 1) {
    const prev = await qc.ensureQueryData({
      queryKey: plannerKeys.planCalendarTasks(planId, from, to, page - 1),
      queryFn: () => fetchCalendarPage(qc, planId, from, to, page - 1),
      staleTime: CALENDAR_STALE_TIME,
    });
    if (!prev.next_cursor) {
      // Paged past the end (stale URL): render empty, keep the count.
      return { tasks: [], total_count: prev.total_count };
    }
    cursor = prev.next_cursor;
  }
  return plannerClient.listCalendarTasks(planId, apiFrom(from), apiTo(to), {
    limit: CALENDAR_PAGE_SIZE,
    cursor,
  });
}

export function useCalendarTasks(planId: string, from: string, to: string, page: number) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: plannerKeys.planCalendarTasks(planId, from, to, page),
    queryFn: () => fetchCalendarPage(qc, planId, from, to, page),
    enabled: Boolean(planId && from && to),
    staleTime: CALENDAR_STALE_TIME,
    placeholderData: keepPreviousData,
  });
}
