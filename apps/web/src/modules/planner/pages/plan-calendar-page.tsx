import type { TaskWithAssigneesRow } from '@seta/planner';
import { EmptyState } from '@seta/shared-ui';
import { useEffect, useMemo } from 'react';
import { GridSkeleton } from '../components/board-skeleton';
import { CalendarPagination } from '../components/calendar/calendar-pagination';
import { CalendarToolbar } from '../components/calendar/calendar-toolbar';
import { PlanError } from '../components/plan-error';
import { useCalendarTasks } from '../hooks/queries/use-calendar-tasks';
import { currentMonthRange } from '../lib/calendar-dates';
import { formatDueShort } from '../lib/format-due-short';
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
        <ul
          className="flex flex-col gap-1 overflow-y-auto px-7 py-2"
          data-testid="calendar-task-list"
        >
          {visibleTasks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded border border-hairline bg-surface-1 px-3 py-2 text-left text-body-sm text-ink hover:bg-surface-2"
                onClick={() => onOpenTask(t.id)}
              >
                <span className="truncate">{t.title}</span>
                {t.due_at && (
                  <span className="text-caption text-ink-muted">{formatDueShort(t.due_at)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
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
