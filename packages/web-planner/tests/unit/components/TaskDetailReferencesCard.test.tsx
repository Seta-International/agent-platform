import type { TaskLinkRow, TaskReferenceRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailReferencesCard } from '../../../src/components/TaskDetailReferencesCard';
import { makeTaskDetail } from '../../../src/testing/fixtures';

vi.mock('@seta/web-identity', async (orig) => ({
  ...(await orig<typeof import('@seta/web-identity')>()),
  usePermission: vi.fn(() => true),
}));

import { usePermission } from '@seta/web-identity';

beforeEach(() => {
  // The URL-reference tests assume the permission is held; only the last test
  // takes it away.
  vi.mocked(usePermission).mockReturnValue(true);
});

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

function renderWithClient(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('TaskDetailReferencesCard', () => {
  it('the fixture yields a complete TaskDetailRow', () => {
    const detail = makeTaskDetail();
    expect(detail.checklist).toEqual([]);
    expect(detail.references).toEqual([]);
    expect(detail.links).toEqual([]);
  });

  it('renders one row per reference', () => {
    const refs = [
      ref({ id: 'r1', alias: 'A' }),
      ref({ id: 'r2', url: 'https://b.test', alias: 'B' }),
      ref({ id: 'r3', url: 'https://c.test', alias: 'C' }),
      ref({ id: 'r4', url: 'https://d.test', alias: 'D' }),
    ];
    renderWithClient(
      <TaskDetailReferencesCard task={makeTaskDetail({ references: refs })} planId="p1" />,
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('is not wired into a drag-drop context (no reorder in this PR)', () => {
    const { container } = renderWithClient(
      <TaskDetailReferencesCard
        task={makeTaskDetail({ references: [ref({ id: 'r1' })] })}
        planId="p1"
      />,
    );
    expect(container.querySelector('[data-rfd-droppable-id]')).toBeNull();
    expect(container.querySelector('[data-rfd-draggable-id]')).toBeNull();
  });

  it('calls addTaskReference when a URL is pasted and Enter pressed', async () => {
    const captured = vi.fn<(body: Record<string, unknown>) => void>();
    server.use(
      http.post('/api/planner/v1/tasks/t1/references', async ({ request }) => {
        captured((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(ref({ id: 'rNew' }));
      }),
    );
    renderWithClient(
      <TaskDetailReferencesCard task={makeTaskDetail({ references: [] })} planId="p1" />,
    );
    const input = screen.getByPlaceholderText(/Paste a URL/i);
    fireEvent.change(input, { target: { value: 'https://added.test/doc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(captured).toHaveBeenCalled());
    expect(captured.mock.calls[0]?.[0]).toMatchObject({ url: 'https://added.test/doc' });
  });

  it('shows a validation message when the reference already exists (FUT-42)', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    server.use(
      http.post('/api/planner/v1/tasks/t1/references', () =>
        HttpResponse.json(
          {
            error: 'DUPLICATE_REFERENCE',
            message: 'Reference with this URL already exists on task',
          },
          { status: 409 },
        ),
      ),
    );
    renderWithClient(
      <TaskDetailReferencesCard task={makeTaskDetail({ references: [] })} planId="p1" />,
    );
    const input = screen.getByPlaceholderText(/Paste a URL/i);
    await user.type(input, 'https://dupe.test/doc{Enter}');
    expect(await screen.findByText(/already exists on the task/i)).toBeInTheDocument();
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
        task={makeTaskDetail({ references: [ref({ id: 'r1', url: 'https://x.test/y' })] })}
        planId="p1"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(captured.mock.calls[0]?.[0]).toEqual({ url: 'https://x.test/y' });
  });
});

function link(over: Partial<TaskLinkRow> = {}): TaskLinkRow {
  return {
    id: 'l1',
    kind: 'relates',
    direction: 'outgoing',
    other_task_id: 'other-1',
    other_task_title: 'Fix login bug',
    other_task_plan_id: 'p1',
    other_task_deleted_at: null,
    can_unlink: true,
    created_at: '2026-08-01T00:00:00Z',
    ...over,
  };
}

describe('TaskDetailReferencesCard — Related tasks', () => {
  it('phrases each kind by direction', () => {
    renderWithClient(
      <TaskDetailReferencesCard
        task={makeTaskDetail({
          links: [
            link({ id: 'l1', kind: 'relates', direction: 'outgoing', other_task_title: 'A' }),
            link({ id: 'l2', kind: 'duplicates', direction: 'outgoing', other_task_title: 'B' }),
            link({ id: 'l3', kind: 'duplicates', direction: 'incoming', other_task_title: 'C' }),
            link({ id: 'l4', kind: 'blocks', direction: 'outgoing', other_task_title: 'D' }),
            link({ id: 'l5', kind: 'blocks', direction: 'incoming', other_task_title: 'E' }),
          ],
        })}
        planId="p1"
      />,
    );
    expect(screen.getByText('Related to A')).toBeInTheDocument();
    expect(screen.getByText('Duplicate of B')).toBeInTheDocument();
    expect(screen.getByText('Duplicated by C')).toBeInTheDocument();
    expect(screen.getByText('Blocks D')).toBeInTheDocument();
    expect(screen.getByText('Blocked by E')).toBeInTheDocument();
  });

  // A merge leaves its duplicate in trash. Hiding the row would make the merge's
  // own result invisible, which is the reason getTask lists it at all.
  it('marks a row whose other task is in trash', () => {
    renderWithClient(
      <TaskDetailReferencesCard
        task={makeTaskDetail({
          links: [
            link({
              kind: 'duplicates',
              direction: 'incoming',
              other_task_title: 'Dup',
              other_task_deleted_at: '2026-08-02T00:00:00Z',
            }),
          ],
        })}
        planId="p1"
      />,
    );
    expect(screen.getByText('Duplicated by Dup')).toBeInTheDocument();
    expect(screen.getByText(/in trash/i)).toBeInTheDocument();
  });

  it('DELETEs by link id when × is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const seen = vi.fn<(path: string) => void>();
    server.use(
      http.delete('/api/planner/v1/task-links/:linkId', ({ request }) => {
        seen(new URL(request.url).pathname);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithClient(
      <TaskDetailReferencesCard
        task={makeTaskDetail({ links: [link({ id: 'l9' })] })}
        planId="p1"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(seen).toHaveBeenCalledWith('/api/planner/v1/task-links/l9'));
  });

  it('disables Remove — with a reason — when can_unlink is false', () => {
    renderWithClient(
      <TaskDetailReferencesCard
        task={makeTaskDetail({ links: [link({ can_unlink: false })] })}
        planId="p1"
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
    expect(screen.getByText(/edit access to both tasks/i)).toBeInTheDocument();
  });

  // THE regression this gate exists to prevent. usePermission reads a FLAT list
  // off the session, so it cannot express "update on both groups". A link whose
  // other endpoint sits in a group that list does not mention must still be
  // removable when the server says it is.
  it('enables Remove on can_unlink even when usePermission alone would disable it', () => {
    vi.mocked(usePermission).mockReturnValue(false);
    renderWithClient(
      <TaskDetailReferencesCard
        task={makeTaskDetail({ links: [link({ can_unlink: true })] })}
        planId="p1"
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled();
  });
});
