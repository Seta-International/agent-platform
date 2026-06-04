import type { TaskWithAssigneesRow } from '@seta/planner';
import { EmptyState } from '@seta/shared-ui';
import { useEffect, useMemo } from 'react';
import { GridSkeleton } from '../components/board-skeleton';
import { CalendarGrid } from '../components/calendar/calendar-grid';
import { CalendarPagination } from '../components/calendar/calendar-pagination';
import { CalendarToolbar } from '../components/calendar/calendar-toolbar';
import { PlanError } from '../components/plan-error';
import { useCalendarTasks } from '../hooks/queries/use-calendar-tasks';
import { currentMonthRange, toDateKey } from '../lib/calendar-dates';
import type { BoardFilters } from '../state/url-state';

export interface PlanCalendarPageProps {
  planId: string;
  /** YYYY-MM-DD; undefined until the mount effect pushes a default range. */
  calFrom?: string;
  calTo?: string;
  calPage: number;
  filters: BoardFilters;
  q: string;
  onRangeChange: (from: string, to: string, opts?: { replace?: boolean }) => void;
  onPageChange: (page: number) => void;
  onOpenTask: (taskId: string) => void;
  onSwitchToBoard: () => void;
}

export function applyBoardFilters(
  tasks: TaskWithAssigneesRow[],
  filters: BoardFilters,
  q: string,
): TaskWithAssigneesRow[] {
  return tasks.filter((t) => {
    if (
      filters.assignee_ids.length &&
      !t.assignees.some((a) => filters.assignee_ids.includes(a.user_id))
    ) {
      return false;
    }
    if (filters.label_ids.length && !t.labels.some((l) => filters.label_ids.includes(l.id))) {
      return false;
    }
    if (filters.skill_tags.length && !t.skill_tags.some((s) => filters.skill_tags.includes(s))) {
      return false;
    }
    if (q && !t.title.toLowerCase().includes(q.toLowerCase())) {
      return false;
    }
    return true;
  });
}

export function PlanCalendarPage({
  planId,
  calFrom,
  calTo,
  calPage,
  filters,
  q,
  onRangeChange,
  onPageChange,
  onOpenTask,
  onSwitchToBoard,
}: PlanCalendarPageProps) {
  const hasRange = calFrom !== undefined && calTo !== undefined;
  useEffect(() => {
    if (!hasRange) {
      const r = currentMonthRange(new Date());
      onRangeChange(r.from, r.to, { replace: true });
    }
  }, [hasRange, onRangeChange]);

  const query = useCalendarTasks(planId, calFrom ?? '', calTo ?? '', calPage);

  const visibleTasks = useMemo(
    () => applyBoardFilters(query.data?.tasks ?? [], filters, q),
    [query.data, filters, q],
  );

  if (!hasRange || query.isPending) {
    return <GridSkeleton />;
  }
  if (query.isError || !query.data) {
    return <PlanError onRetry={() => query.refetch()} />;
  }

  const { total_count, next_cursor } = query.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="plan-calendar-page">
      <CalendarToolbar
        from={calFrom}
        to={calTo}
        totalCount={total_count}
        onRangeChange={onRangeChange}
      />
      {visibleTasks.length === 0 ? (
        <EmptyState
          title="No tasks scheduled in this range"
          description="Tasks with a start or due date inside the selected range appear here."
          action={{ label: 'Switch to Board', onClick: onSwitchToBoard }}
        />
      ) : (
        <CalendarGrid
          tasks={visibleTasks}
          from={calFrom}
          to={calTo}
          todayKey={toDateKey(new Date())}
          onOpenTask={onOpenTask}
        />
      )}
      <CalendarPagination
        page={calPage}
        totalCount={total_count}
        hasNext={Boolean(next_cursor)}
        onPageChange={onPageChange}
      />
    </div>
  );
}
