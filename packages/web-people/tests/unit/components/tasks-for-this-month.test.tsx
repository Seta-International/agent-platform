import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TasksForThisMonth } from '../../../src/components/tasks-for-this-month.tsx';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children: React.ReactNode;
    to: string;
    search?: unknown;
    className?: string;
    'data-testid'?: string;
  }) => (
    <a href={to} data-testid={rest['data-testid']} className={rest.className}>
      {children}
    </a>
  ),
}));

describe('TasksForThisMonth (AC2–AC4)', () => {
  it('renders dual-role groups without mixing cards', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <TasksForThisMonth
          cycleStatus="open"
          search={{ month: '2026-07', kind: 'tl', project: 'p1' }}
          groups={[
            {
              label: 'As TL · Alpha',
              capacity: {
                kind: 'tl',
                project_id: 'p1',
                account_id: 'a1',
                label: 'Alpha',
              },
              cards: [{ kind: 'unscored', unscored: 3, total: 5, interactive: true }],
            },
            {
              label: 'As Member · Beta',
              capacity: {
                kind: 'member',
                project_id: 'p2',
                account_id: 'a1',
                label: 'Beta',
              },
              cards: [
                { kind: 'self_assessment', submitted: false, interactive: true },
                { kind: 'morale', submitted: false, interactive: true },
              ],
            },
          ]}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('tasks-for-this-month')).toBeInTheDocument();
    const groups = screen.getAllByTestId('month-task-group');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveAttribute('data-label', 'As TL · Alpha');
    expect(groups[1]).toHaveAttribute('data-label', 'As Member · Beta');
    expect(screen.getByText(/3\/5/)).toBeInTheDocument();
    expect(screen.getByText(/still unscored/i)).toBeInTheDocument();
    expect(screen.getByTestId('month-task-action-unscored')).toHaveAttribute(
      'href',
      '/people/performance/scoring',
    );
    expect(screen.getByTestId('month-task-action-self_assessment')).toBeInTheDocument();
  });

  it('locked card has label and no action link (AC2)', () => {
    render(
      <TasksForThisMonth
        cycleStatus="locked"
        search={{ month: '2026-07' }}
        groups={[
          {
            label: 'As TL · Alpha',
            capacity: {
              kind: 'tl',
              project_id: 'p1',
              account_id: 'a1',
              label: 'Alpha',
            },
            cards: [{ kind: 'cycle_locked' }],
          },
        ]}
      />,
    );

    expect(screen.getByText('Cycle locked')).toBeInTheDocument();
    expect(screen.queryByTestId('month-task-action-unscored')).not.toBeInTheDocument();
    expect(screen.queryByTestId('month-task-action-cycle_locked')).not.toBeInTheDocument();
  });
});
