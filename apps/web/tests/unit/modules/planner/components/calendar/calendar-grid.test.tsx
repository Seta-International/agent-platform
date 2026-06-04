import type { TaskWithAssigneesRow } from '@seta/planner';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CalendarGrid } from '../../../../../../src/modules/planner/components/calendar/calendar-grid';

function task(id: string, start_at: string | null, due_at: string | null): TaskWithAssigneesRow {
  return {
    id,
    title: id,
    start_at,
    due_at,
    priority_number: 5,
    assignees: [],
    labels: [],
    skill_tags: [],
    external_source: 'native',
    sync_status: 'idle',
  } as unknown as TaskWithAssigneesRow;
}

const baseProps = {
  from: '2026-06-01',
  to: '2026-06-30',
  todayKey: '2026-06-04',
  onOpenTask: vi.fn(),
};

describe('CalendarGrid', () => {
  it('renders 5 padded week rows and 35 day cells for June 2026', () => {
    render(<CalendarGrid {...baseProps} tasks={[]} />);
    expect(screen.getAllByTestId('calendar-week-row')).toHaveLength(5);
    expect(screen.getByTestId('calendar-day-2026-06-01')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-day-2026-07-05')).toBeInTheDocument(); // padding day
  });

  it('marks today with the highlight ring', () => {
    render(<CalendarGrid {...baseProps} tasks={[]} />);
    const today = screen.getByTestId('calendar-day-2026-06-04');
    expect(today.querySelector('.ring-2')).not.toBeNull();
  });

  it('renders a week-crossing task once per touched week row (AC-4)', () => {
    render(
      <CalendarGrid
        {...baseProps}
        tasks={[task('long', '2026-06-05T00:00:00Z', '2026-06-09T00:00:00Z')]} // Fri wk1 → Tue wk2
      />,
    );
    const segments = screen.getAllByTestId('task-span-long');
    expect(segments).toHaveLength(2);
    expect(segments[0]!.style.gridColumn).toBe('5 / span 3'); // Fri–Sun
    expect(segments[1]!.style.gridColumn).toBe('1 / span 2'); // Mon–Tue
  });

  it('renders weekday headers Mon–Sun', () => {
    render(<CalendarGrid {...baseProps} tasks={[]} />);
    for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(d)).toBeInTheDocument();
    }
  });
});
