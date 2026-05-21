import type { ChecklistItemRow, TaskDetailRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { computeReorderHint } from './checklist-reorder';
import { TaskDetailChecklistCard } from './TaskDetailChecklistCard';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function item(over: Partial<ChecklistItemRow> = {}): ChecklistItemRow {
  return {
    id: 'c1',
    task_id: 't1',
    label: 'Item',
    checked: false,
    order_hint: 'a0',
    external_id: null,
    external_etag: null,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

function makeDetail(items: ChecklistItemRow[]): TaskDetailRow {
  return { ...makeTaskWithAssignees({ id: 't1' }), checklist: items, references: [] };
}

function renderWithClient(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('TaskDetailChecklistCard', () => {
  it('renders one row per item with checkbox and label', () => {
    const items = [
      item({ id: 'c1', label: 'one', order_hint: 'a0' }),
      item({ id: 'c2', label: 'two', order_hint: 'a1' }),
      item({ id: 'c3', label: 'three', order_hint: 'a2' }),
      item({ id: 'c4', label: 'four', order_hint: 'a3' }),
      item({ id: 'c5', label: 'five', order_hint: 'a4' }),
    ];
    renderWithClient(<TaskDetailChecklistCard task={makeDetail(items)} planId="p1" />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('five')).toBeInTheDocument();
    expect(screen.queryByText('a0')).not.toBeInTheDocument();
    expect(screen.queryByText('a4')).not.toBeInTheDocument();
  });

  it('toggles a checkbox by calling updateChecklistItem with { checked }', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.patch('/api/planner/v1/checklist-items/c1', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(item({ id: 'c1', checked: true }));
      }),
    );

    renderWithClient(
      <TaskDetailChecklistCard
        task={makeDetail([item({ id: 'c1', label: 'do', checked: false })])}
        planId="p1"
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: /do/i }));
    expect(captured.mock.calls[0]?.[0]).toEqual({ patch: { checked: true } });
  });

  it('adds an item via the inline input on Enter', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.post('/api/planner/v1/tasks/t1/checklist', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(item({ id: 'cNew', label: 'new step' }));
      }),
    );

    renderWithClient(<TaskDetailChecklistCard task={makeDetail([])} planId="p1" />);
    await user.click(screen.getByRole('button', { name: /Add item/i }));
    const input = screen.getByRole('textbox', { name: /New checklist item/i });
    await user.type(input, 'new step{Enter}');
    expect(captured.mock.calls[0]?.[0]).toMatchObject({ label: 'new step' });
  });
});

describe('computeReorderHint', () => {
  it('returns a hint between neighbors for a middle drop', () => {
    const items = [
      item({ id: 'a', order_hint: 'a0' }),
      item({ id: 'b', order_hint: 'a1' }),
      item({ id: 'c', order_hint: 'a2' }),
    ];
    const hint = computeReorderHint(items, 2, 0);
    expect(hint).toBeTruthy();
    expect(hint && hint < 'a0').toBe(true);
  });

  it('returns a hint less than the first when dropping at the top', () => {
    const items = [item({ id: 'a', order_hint: 'a0' }), item({ id: 'b', order_hint: 'a1' })];
    const hint = computeReorderHint(items, 1, 0);
    expect(hint && hint < 'a0').toBe(true);
  });

  it('returns a hint greater than the last when dropping at the bottom', () => {
    const items = [item({ id: 'a', order_hint: 'a0' }), item({ id: 'b', order_hint: 'a1' })];
    const hint = computeReorderHint(items, 0, 1);
    expect(hint && hint > 'a1').toBe(true);
  });

  it('returns null when source and destination are the same', () => {
    const items = [item({ id: 'a', order_hint: 'a0' })];
    expect(computeReorderHint(items, 0, 0)).toBeNull();
  });
});
