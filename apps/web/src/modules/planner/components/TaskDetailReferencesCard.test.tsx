import type { TaskDetailRow, TaskReferenceRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskDetailReferencesCard } from './TaskDetailReferencesCard';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function ref(over: Partial<TaskReferenceRow> = {}): TaskReferenceRow {
  return {
    id: 'r1',
    tenant_id: 't',
    task_id: 't1',
    url: 'https://example.com/a',
    alias: 'A',
    type: 'web',
    preview_priority: 'a0',
    external_etag: null,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

function makeDetail(refs: TaskReferenceRow[]): TaskDetailRow {
  return { ...makeTaskWithAssignees({ id: 't1' }), checklist: [], references: refs };
}

function renderWithClient(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('TaskDetailReferencesCard', () => {
  it('renders one row per reference', () => {
    const refs = [
      ref({ id: 'r1', alias: 'A' }),
      ref({ id: 'r2', url: 'https://b.test', alias: 'B' }),
      ref({ id: 'r3', url: 'https://c.test', alias: 'C' }),
      ref({ id: 'r4', url: 'https://d.test', alias: 'D' }),
    ];
    renderWithClient(<TaskDetailReferencesCard task={makeDetail(refs)} planId="p1" />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('is not wired into a drag-drop context (no reorder in this PR)', () => {
    const { container } = renderWithClient(
      <TaskDetailReferencesCard task={makeDetail([ref({ id: 'r1' })])} planId="p1" />,
    );
    expect(container.querySelector('[data-rfd-droppable-id]')).toBeNull();
    expect(container.querySelector('[data-rfd-draggable-id]')).toBeNull();
  });

  it('calls addTaskReference when a URL is pasted and Enter pressed', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.post('/api/planner/v1/tasks/t1/references', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(ref({ id: 'rNew' }));
      }),
    );
    renderWithClient(<TaskDetailReferencesCard task={makeDetail([])} planId="p1" />);
    const input = screen.getByPlaceholderText(/Paste a URL/i);
    await user.type(input, 'https://added.test/doc{Enter}');
    expect(captured).toHaveBeenCalled();
    expect(captured.mock.calls[0]?.[0]).toMatchObject({ url: 'https://added.test/doc' });
  });

  it('calls removeTaskReference when × is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.delete('/api/planner/v1/tasks/t1/references', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({});
      }),
    );
    renderWithClient(
      <TaskDetailReferencesCard
        task={makeDetail([ref({ id: 'r1', url: 'https://x.test/y' })])}
        planId="p1"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(captured.mock.calls[0]?.[0]).toEqual({ url: 'https://x.test/y' });
  });
});
