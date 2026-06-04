import type { TaskWithAssigneesRow } from '@seta/planner';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoDateTasksBanner } from '../../../../../../src/modules/planner/components/calendar/no-date-tasks-banner';

function task(id: string, title: string): TaskWithAssigneesRow {
  return { id, title } as TaskWithAssigneesRow;
}

describe('NoDateTasksBanner', () => {
  it('renders nothing when there are no unscheduled tasks', () => {
    render(<NoDateTasksBanner tasks={[]} onOpenTask={() => {}} />);
    expect(screen.queryByTestId('no-date-banner')).not.toBeInTheDocument();
  });

  it('starts collapsed with a count badge; expanding reveals task pills', async () => {
    render(
      <NoDateTasksBanner
        tasks={[task('t1', 'Loose end'), task('t2', 'Another')]}
        onOpenTask={() => {}}
      />,
    );
    expect(screen.getByTestId('no-date-banner')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('Loose end')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /unscheduled tasks/i }));
    expect(screen.getByText('Loose end')).toBeInTheDocument();
    expect(screen.getByText('Another')).toBeInTheDocument();
  });

  it('clicking a pill opens the task detail', async () => {
    const onOpenTask = vi.fn();
    render(<NoDateTasksBanner tasks={[task('t1', 'Loose end')]} onOpenTask={onOpenTask} />);
    await userEvent.click(screen.getByRole('button', { name: /unscheduled tasks/i }));
    await userEvent.click(screen.getByText('Loose end'));
    expect(onOpenTask).toHaveBeenCalledWith('t1');
  });
});
