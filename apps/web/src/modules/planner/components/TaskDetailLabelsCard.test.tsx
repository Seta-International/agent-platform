import type { LabelRow, TaskWithAssigneesRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

  describe('isLinkedToM365=false (default behavior)', () => {
    it('shows slot-less labels as enabled items with no "Local only" badge', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      const task = makeTask([]);
      renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" isLinkedToM365={false} />, [
        label({ id: 'la', name: 'alpha' }),
      ]);
      await user.click(screen.getByRole('button', { name: /Add label/i }));
      await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
      expect(screen.queryByText('Local only')).not.toBeInTheDocument();
      const item = screen.getByRole('option', { name: /alpha/i });
      expect(item).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('calls apply mutation when a slot-less label is clicked', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      const applyMutate = vi.fn();
      server.use(
        http.post('/api/planner/v1/tasks/t1/labels', async () => {
          applyMutate();
          return HttpResponse.json({});
        }),
      );

      const task = makeTask([]);
      renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" isLinkedToM365={false} />, [
        label({ id: 'la', name: 'alpha' }),
      ]);
      await user.click(screen.getByRole('button', { name: /Add label/i }));
      await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
      await user.click(screen.getByRole('option', { name: /alpha/i }));
      await waitFor(() => expect(applyMutate).toHaveBeenCalledOnce());
    });
  });

  describe('isLinkedToM365=true', () => {
    it('shows slot-less labels with "Local only" badge text', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      const task = makeTask([]);
      renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" isLinkedToM365={true} />, [
        label({ id: 'la', name: 'alpha' }),
      ]);
      await user.click(screen.getByRole('button', { name: /Add label/i }));
      await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
      expect(screen.getByText('Local only')).toBeInTheDocument();
    });

    it('marks slot-less label items as disabled (aria-disabled)', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      const task = makeTask([]);
      renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" isLinkedToM365={true} />, [
        label({ id: 'la', name: 'alpha' }),
      ]);
      await user.click(screen.getByRole('button', { name: /Add label/i }));
      await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());
      const item = screen.getByRole('option', { name: /alpha/i });
      expect(item).toHaveAttribute('aria-disabled', 'true');
    });

    it('does NOT call apply mutation when a disabled slot-less label is clicked', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();

      const applyMutate = vi.fn();
      server.use(
        http.post('/api/planner/v1/tasks/t1/labels', async () => {
          applyMutate();
          return HttpResponse.json({});
        }),
      );

      const task = makeTask([]);
      renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" isLinkedToM365={true} />, [
        label({ id: 'la', name: 'alpha' }),
      ]);
      await user.click(screen.getByRole('button', { name: /Add label/i }));
      await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());

      const item = screen.getByRole('option', { name: /alpha/i });
      // pointer-events-none on disabled item means the click won't trigger onSelect
      await user.click(item);
      // Wait a tick to confirm mutation wasn't triggered
      await new Promise((r) => setTimeout(r, 50));
      expect(applyMutate).not.toHaveBeenCalled();
    });

    it('shows tooltip message when hovering a disabled slot-less label', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      const task = makeTask([]);
      renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" isLinkedToM365={true} />, [
        label({ id: 'la', name: 'alpha' }),
      ]);
      await user.click(screen.getByRole('button', { name: /Add label/i }));
      await waitFor(() => expect(screen.getByText('alpha')).toBeInTheDocument());

      // The tooltip trigger is the wrapper div around the disabled CommandItem
      const option = screen.getByRole('option', { name: /alpha/i });
      const trigger = option.closest('[data-radix-collection-item]')?.parentElement ?? option;
      await user.hover(trigger);
      await waitFor(() =>
        expect(
          screen.getAllByText(
            'Add a category slot in Plan Settings to sync this label to M365 Planner.',
          ).length,
        ).toBeGreaterThanOrEqual(1),
      );
    });
  });
});
