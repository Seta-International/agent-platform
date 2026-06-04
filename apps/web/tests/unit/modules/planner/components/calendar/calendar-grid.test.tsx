import type { TaskWithAssigneesRow } from '@seta/planner';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CalendarGrid } from '../../../../../../src/modules/planner/components/calendar/calendar-grid';

// FC uses ResizeObserver and other DOM APIs absent in jsdom — mock the whole module.
// The mock renders events as buttons so eventClick/eventDrop can be triggered.
let lastFCProps: Record<string, unknown> = {};
vi.mock('@fullcalendar/react', () => ({
  default: vi.fn((props: Record<string, unknown>) => {
    lastFCProps = props;
    const events =
      (props.events as Array<{
        id: string;
        title: string;
        extendedProps: Record<string, unknown>;
      }>) ?? [];
    return (
      <div data-testid="calendar-grid-fc">
        {events.map((e) => (
          <button
            key={e.id}
            type="button"
            data-testid={`fc-event-${e.id}`}
            onClick={() =>
              (
                props.eventClick as (arg: {
                  event: { id: string; extendedProps: Record<string, unknown> };
                }) => void
              )?.({
                event: { id: e.id, extendedProps: e.extendedProps },
              })
            }
          >
            {e.title}
          </button>
        ))}
      </div>
    );
  }),
}));
vi.mock('@fullcalendar/daygrid', () => ({ default: {} }));
vi.mock('@fullcalendar/interaction', () => ({ default: {} }));

function task(id: string, start_at: string | null, due_at: string | null): TaskWithAssigneesRow {
  return {
    id,
    title: id,
    start_at,
    due_at,
    assignees: [],
    priority_number: 5,
  } as unknown as TaskWithAssigneesRow;
}

const baseProps = {
  from: '2026-06-01',
  to: '2026-06-30',
  onOpenTask: vi.fn(),
  onRescheduleTask: vi.fn(),
};

describe('CalendarGrid', () => {
  it('renders the calendar-grid wrapper and delegates to FullCalendar', () => {
    render(<CalendarGrid {...baseProps} tasks={[]} />);
    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-grid-fc')).toBeInTheDocument();
  });

  it('passes dated tasks as events; undated tasks are excluded', () => {
    render(
      <CalendarGrid
        {...baseProps}
        tasks={[
          task('t1', '2026-06-02T00:00:00Z', '2026-06-04T00:00:00Z'),
          task('t2', null, null), // undated — should be excluded
        ]}
      />,
    );
    expect(screen.getByTestId('fc-event-t1')).toBeInTheDocument();
    expect(screen.queryByTestId('fc-event-t2')).not.toBeInTheDocument();
  });

  it('calls onOpenTask when an event is clicked', async () => {
    const onOpenTask = vi.fn();
    render(
      <CalendarGrid
        {...baseProps}
        onOpenTask={onOpenTask}
        tasks={[task('t1', '2026-06-02T00:00:00Z', '2026-06-04T00:00:00Z')]}
      />,
    );
    await userEvent.click(screen.getByTestId('fc-event-t1'));
    expect(onOpenTask).toHaveBeenCalledWith('t1');
  });

  it('calls onRescheduleTask with the task, new dates, and revert when eventDrop fires', () => {
    const onRescheduleTask = vi.fn();
    const t = task('t1', '2026-06-02T00:00:00Z', '2026-06-04T00:00:00Z');
    render(<CalendarGrid {...baseProps} onRescheduleTask={onRescheduleTask} tasks={[t]} />);

    const revert = vi.fn();
    const newStart = new Date('2026-06-10T00:00:00Z');
    const newEnd = new Date('2026-06-12T00:00:00Z');
    (
      lastFCProps.eventDrop as (arg: {
        event: { id: string; start: Date; end: Date; extendedProps: Record<string, unknown> };
        revert: () => void;
      }) => void
    )({
      event: { id: 't1', start: newStart, end: newEnd, extendedProps: { task: t } },
      revert,
    });

    expect(onRescheduleTask).toHaveBeenCalledWith(t, newStart, newEnd, revert);
  });

  it('passes dateStr to onSelectDate when dateClick fires', () => {
    const onSelectDate = vi.fn();
    render(<CalendarGrid {...baseProps} tasks={[]} onSelectDate={onSelectDate} />);
    (lastFCProps.dateClick as (arg: { dateStr: string }) => void)({ dateStr: '2026-06-15' });
    expect(onSelectDate).toHaveBeenCalledWith('2026-06-15');
  });
});
