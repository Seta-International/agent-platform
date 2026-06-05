import type { TaskWithAssigneesRow } from '@seta/planner';
import { toast } from '@seta/shared-ui';
import { useEffect, useMemo } from 'react';
import { GridSkeleton } from '../components/board-skeleton';
import { CalendarGrid } from '../components/calendar/calendar-grid';
import { CalendarPagination } from '../components/calendar/calendar-pagination';
import { CalendarToolbar } from '../components/calendar/calendar-toolbar';
import { PlanError } from '../components/plan-error';
import { useUpdateTaskSchedule } from '../hooks/mutations/update-task-schedule';
import { useCalendarTasks } from '../hooks/queries/use-calendar-tasks';
import { currentMonthRange } from '../lib/calendar-dates';
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
}: PlanCalendarPageProps) {
  const hasRange = calFrom !== undefined && calTo !== undefined;
  useEffect(() => {
    if (!hasRange) {
      const r = currentMonthRange(new Date());
      onRangeChange(r.from, r.to, { replace: true });
    }
  }, [hasRange, onRangeChange]);

  const query = useCalendarTasks(planId, calFrom ?? '', calTo ?? '', calPage);
  const updateSchedule = useUpdateTaskSchedule(planId);

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

  async function handleReschedule(
    task: TaskWithAssigneesRow,
    newStart: Date | null,
    newEnd: Date | null,
    revert: () => void,
  ) {
    try {
      // FullCalendar all-day events deliver local-midnight Date objects. Use local
      // date parts to build a UTC-midnight ISO string so the date is not shifted by
      // the user's UTC offset when .toISOString() would convert to the previous day.
      const toUtcDay = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T00:00:00.000Z`;

      // FC all-day end is exclusive — step back 1 calendar day (setDate is DST-safe).
      let due_at: string | null = null;
      if (newEnd) {
        const lastDay = new Date(newEnd);
        lastDay.setDate(lastDay.getDate() - 1);
        due_at = toUtcDay(lastDay);
      } else if (newStart) {
        due_at = toUtcDay(newStart);
      }
      // Only carry start_at forward if the task originally had one; dragging a
      // due-only task should not silently add a start date.
      const start_at = task.start_at && newStart && newEnd ? toUtcDay(newStart) : null;

      await updateSchedule.mutateAsync({
        task_id: task.id,
        expected_version: task.version,
        start_at,
        due_at,
      });
    } catch {
      revert();
      toast.error('Failed to reschedule task. Please try again.');
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="plan-calendar-page">
      <CalendarToolbar
        from={calFrom}
        to={calTo}
        totalCount={total_count}
        onRangeChange={onRangeChange}
      />
      <CalendarGrid
        tasks={visibleTasks}
        from={calFrom}
        to={calTo}
        onOpenTask={onOpenTask}
        onRescheduleTask={handleReschedule}
      />
      <CalendarPagination
        page={calPage}
        totalCount={total_count}
        hasNext={Boolean(next_cursor)}
        onPageChange={onPageChange}
      />
    </div>
  );
}
