import type { LabelRow, TaskWithAssigneesRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailLabelsCard } from '../../../src/components/TaskDetailLabelsCard';
import { plannerKeys } from '../../../src/state/query-keys';
import { makeTaskWithAssignees } from '../../../src/testing/fixtures';

// The Astryx Tokenizer's onChange is discriminated by change.type ('add' /
// 'remove' / 'create'), and asserting the exact vars passed to apply/unapply/
// create/update requires observing the mutation hooks' `.mutate` calls
// directly — MSW only sees the wire-level body (e.g. apply strips
// label_name/label_color before the request), which can't carry the richer
// assertions below. Mock the four label mutation hooks the same way
// grid-bulk-action-footer.test.tsx mocks use-group-members.
const { applySpy, unapplySpy, createSpy, updateSpy, deleteSpy } = vi.hoisted(() => ({
  applySpy: vi.fn(),
  unapplySpy: vi.fn(),
  createSpy: vi.fn(async (v: { name: string; color: string }) => ({
    id: 'new-label-id',
    tenant_id: 't',
    plan_id: 'p1',
    name: v.name,
    color: v.color,
    category_slot: null,
    created_at: '2026-05-01T00:00:00Z',
    deleted_at: null,
  })),
  updateSpy: vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  deleteSpy: vi.fn(),
}));

vi.mock('../../../src/hooks/mutations/apply-label', () => ({
  useApplyLabel: () => ({ mutate: applySpy, mutateAsync: applySpy, isPending: false }),
}));
vi.mock('../../../src/hooks/mutations/unapply-label', () => ({
  useUnapplyLabel: () => ({ mutate: unapplySpy, mutateAsync: unapplySpy, isPending: false }),
}));
vi.mock('../../../src/hooks/mutations/create-label', () => ({
  useCreateLabel: () => ({ mutate: createSpy, mutateAsync: createSpy, isPending: false }),
}));
vi.mock('../../../src/hooks/mutations/update-label', () => ({
  useUpdateLabel: () => ({ mutate: updateSpy, mutateAsync: updateSpy, isPending: false }),
}));
vi.mock('../../../src/hooks/mutations/delete-label', () => ({
  useDeleteLabel: () => ({ mutate: deleteSpy, mutateAsync: deleteSpy, isPending: false }),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  applySpy.mockClear();
  unapplySpy.mockClear();
  createSpy.mockClear();
  updateSpy.mockClear();
  deleteSpy.mockClear();
});

function fxLabel(id: string, name: string, over: Partial<LabelRow> = {}): LabelRow {
  return {
    id,
    tenant_id: 't',
    plan_id: 'p1',
    name,
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

const taskNoLabels = makeTask([]);
const taskWithUrgent = makeTask([fxLabel('l-urgent', 'Urgent')]);

function renderWithClient(node: ReactNode, planLabels?: LabelRow[]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (planLabels) qc.setQueryData(plannerKeys.planLabels('p1'), planLabels);
  render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
  return { applySpy, unapplySpy, createSpy, updateSpy };
}

describe('TaskDetailLabelsCard', () => {
  it('renders applied labels as chips', () => {
    const task = makeTask([fxLabel('l1', 'bug'), fxLabel('l2', 'frontend')]);
    renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" />);
    expect(screen.getByText('bug')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
  });

  it('lists slot-less plan labels in the tokenizer dropdown and applies on select', async () => {
    const user = userEvent.setup();
    const { applySpy } = renderWithClient(
      <TaskDetailLabelsCard task={taskNoLabels} planId="p1" />,
      [fxLabel('l-urgent', 'Urgent')],
    );
    const input = screen.getByPlaceholderText(/filter or create label/i);
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: /Urgent/ }));
    expect(applySpy).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: taskNoLabels.id, label_id: 'l-urgent' }),
    );
  });

  it('creates a label on the fly when the typed name has no exact match', async () => {
    const user = userEvent.setup();
    const { createSpy } = renderWithClient(
      <TaskDetailLabelsCard task={taskNoLabels} planId="p1" />,
      [],
    );
    const input = screen.getByPlaceholderText(/filter or create label/i);
    await user.type(input, 'Brand New');
    await user.keyboard('{Enter}'); // hasCreate commits the typed value
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Brand New' }));
  });

  it('unapplies a label when its token is removed', async () => {
    const user = userEvent.setup();
    const { unapplySpy } = renderWithClient(
      <TaskDetailLabelsCard task={taskWithUrgent} planId="p1" />,
      [fxLabel('l-urgent', 'Urgent')],
    );
    await user.click(screen.getByRole('button', { name: /remove urgent/i }));
    expect(unapplySpy).toHaveBeenCalledWith(expect.objectContaining({ label_id: 'l-urgent' }));
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
    const task = makeTask([fxLabel('lc', 'cat2', { category_slot: 2 })]);
    renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" />);
    await waitFor(() => expect(screen.getByText(/Discovery & research/)).toBeInTheDocument());
    expect(screen.getByText(/cat 2/)).toBeInTheDocument();
    // pill is read-only — no edit affordances on it
    expect(screen.queryByRole('button', { name: /Edit category/i })).not.toBeInTheDocument();
  });

  it('hides the category-slot section when the task has no category label', () => {
    const task = makeTask([fxLabel('l1', 'plain', { category_slot: null })]);
    renderWithClient(<TaskDetailLabelsCard task={task} planId="p1" />);
    expect(screen.queryByText(/cat /)).not.toBeInTheDocument();
  });

  describe('isLinkedToM365=true', () => {
    it('offers no create and shows the sync note', async () => {
      const user = userEvent.setup();
      renderWithClient(<TaskDetailLabelsCard task={taskNoLabels} planId="p1" isLinkedToM365 />, [
        fxLabel('l-x', 'X'),
      ]);
      expect(screen.getByText(/sync from microsoft planner/i)).toBeInTheDocument();
      const input = screen.queryByPlaceholderText(/filter or create label/i);
      if (input) {
        await user.type(input, 'Nope');
        await user.keyboard('{Enter}');
      }
      expect(createSpy).not.toHaveBeenCalled();
    });
  });

  describe('manage labels', () => {
    it('opens the inline manage panel and edits a label name', async () => {
      const user = userEvent.setup();
      const { updateSpy } = renderWithClient(
        <TaskDetailLabelsCard task={taskNoLabels} planId="p1" />,
        [fxLabel('l-urgent', 'Urgent')],
      );
      await user.click(screen.getByRole('button', { name: /manage labels/i }));
      await user.click(await screen.findByRole('button', { name: /edit urgent/i }));
      const nameInput = screen.getByLabelText(/label name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Critical');
      await user.click(screen.getByRole('button', { name: /^save$/i }));
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          label_id: 'l-urgent',
          patch: expect.objectContaining({ name: 'Critical' }),
        }),
        expect.anything(),
      );
    });
  });
});
