import type { TaskWithAssigneesRow } from '@seta/planner';
import { Button, toast } from '@seta/shared-ui';
import { useEffect, useMemo, useState } from 'react';
import { GridSkeleton } from '../components/board-skeleton';
import { CalendarGrid } from '../components/calendar/calendar-grid';
import { CalendarPagination } from '../components/calendar/calendar-pagination';
import { CalendarQuickCreate } from '../components/calendar/calendar-quick-create';
import { CalendarToolbar } from '../components/calendar/calendar-toolbar';
import { NoDateTasksBanner } from '../components/calendar/no-date-tasks-banner';
import { PlanError } from '../components/plan-error';
import { useUpdateTaskSchedule } from '../hooks/mutations/update-task-schedule';
import { useCalendarTasks } from '../hooks/queries/use-calendar-tasks';
import { useNoDateTasks } from '../hooks/queries/use-no-date-tasks';
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

function applyBoardFilters(
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
  const noDateQ = useNoDateTasks(planId);
  const updateSchedule = useUpdateTaskSchedule(planId);
  const [quickCreate, setQuickCreate] = useState<{
    date: string;
    x: number;
    y: number;
  } | null>(null);
  // Reset the quick-create anchor whenever the displayed range changes using the
  // React-recommended prev-value-in-state pattern (avoids useEffect + setState).
  const [prevFrom, setPrevFrom] = useState(calFrom);
  const [prevTo, setPrevTo] = useState(calTo);
  if (calFrom !== prevFrom || calTo !== prevTo) {
    setPrevFrom(calFrom);
    setPrevTo(calTo);
    setQuickCreate(null);
  }

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

  const noDateTasks = noDateQ.data?.tasks ?? [];
  const todayKey = toDateKey(new Date());
  // AC-10: full empty state only when the range has no matches AND no undated tasks exist.
  const showEmptyState = visibleTasks.length === 0 && noDateTasks.length === 0;
  const emptyStateDate = todayKey >= calFrom && todayKey <= calTo ? todayKey : calFrom;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="plan-calendar-page">
      {quickCreate && (
        <button
          type="button"
          aria-label="Dismiss quick create"
          className="fixed inset-0 z-10 cursor-default"
          onClick={() => setQuickCreate(null)}
        />
      )}
      <CalendarToolbar
        from={calFrom}
        to={calTo}
        totalCount={total_count}
        onRangeChange={onRangeChange}
      />
      <NoDateTasksBanner tasks={noDateTasks} onOpenTask={onOpenTask} />
      {showEmptyState ? (
        <div
          className="relative flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center"
          data-testid="calendar-empty-state"
        >
          <h3 className="text-card-title text-ink">No tasks scheduled in this range</h3>
          <p className="text-body-sm text-ink-subtle">
            Tasks with a start or due date inside the selected range appear here.
          </p>
          <div className="flex items-center gap-3">
            <Button
              onClick={(e) =>
                setQuickCreate({
                  date: emptyStateDate,
                  x: e.clientX,
                  y: e.clientY,
                })
              }
            >
              Create task
            </Button>
            <Button variant="ghost" onClick={onSwitchToBoard}>
              Switch to Board
            </Button>
          </div>
          {quickCreate && (
            <div className="absolute left-1/2 top-2/3 z-20 -translate-x-1/2">
              <CalendarQuickCreate
                planId={planId}
                dueDate={quickCreate.date}
                onClose={() => setQuickCreate(null)}
              />
            </div>
          )}
        </div>
      ) : (
        <CalendarGrid
          tasks={visibleTasks}
          from={calFrom}
          to={calTo}
          onOpenTask={onOpenTask}
          onRescheduleTask={handleReschedule}
          onSelectDate={(dateKey, pos) => setQuickCreate({ date: dateKey, ...pos })}
        />
      )}
      {quickCreate && !showEmptyState && (
        <div
          data-testid="quick-create-anchor"
          className="fixed z-20"
          style={{
            left: Math.min(quickCreate.x + 4, window.innerWidth - 270),
            top: Math.min(quickCreate.y + 4, window.innerHeight - 150),
          }}
        >
          <CalendarQuickCreate
            planId={planId}
            dueDate={quickCreate.date}
            onClose={() => setQuickCreate(null)}
          />
        </div>
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
