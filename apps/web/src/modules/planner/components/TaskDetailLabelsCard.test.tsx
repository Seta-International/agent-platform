import type { LabelRow, TaskWithAssigneesRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { plannerKeys } from '../state/query-keys';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailLabelsCard } from './TaskDetailLabelsCard';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function label(over: Partial<LabelRow> = {}): LabelRow {
  return {
    id: 'lbl1',
    tenant_id: 't',
    plan_id: 'p1',
    name: 'feature',
    color: 'blue',
    category_slot: null,
    created_at: '',
    deleted_at: null,
    ...over,
  };
}

function makeTask(
  labels: LabelRow[],
  over: Partial<TaskWithAssigneesRow> = {},
): TaskWithAssigneesRow {
  return makeTaskWithAssignees({ id: 't1', labels, ...over });
}

function renderWithClient(node: ReactNode, planLabels?: LabelRow[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (planLabels) qc.setQueryData(plannerKeys.planLabels('p1'), planLabels);
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('TaskDetailLabelsCard', () => {
  it('renders applied labels as chips', () => {
    const task = makeTask([
      label({ id: 'l1', name: 'bug' }),
      label({ id: 'l2', name: 'frontend' }),
    ]);
    renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" />);
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
  });

  it('opens a combobox listing plan labels when "Add" is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const task = makeTask([]);
    renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" />, [
      label({ id: 'la', name: 'alpha' }),
      label({ id: 'lb', name: 'beta' }),
    ]);
    await user.click(screen.getByRole('button', { name: /Add label/i }));
    await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('renders a read-only category-slot pill when task has a category label', async () => {
    server.use(
      http.get('/api/planner/v1/plans/p1/categories', () =>
        HttpResponse.json({
          descriptions: { '2': 'Discovery & research' },
          labels: [],
          task_counts: {},
          counts: { categories: 1 },
        }),
      ),
    );
    const task = makeTask([label({ id: 'lc', name: 'cat2', category_slot: 2 })]);
    renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" />);
    await waitFor(() => expect(screen.getByText(/Discovery & research/)).toBeInTheDocument());
    expect(screen.getByText(/cat 2/)).toBeInTheDocument();
    // pill is read-only — no edit affordances on it
    expect(screen.queryByRole('button', { name: /Edit category/i })).not.toBeInTheDocument();
  });

  it('hides the category-slot section when the task has no category label', () => {
    const task = makeTask([label({ id: 'l1', name: 'plain', category_slot: null })]);
    renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" />);
    expect(screen.queryByText(/cat /)).not.toBeInTheDocument();
  });
});
