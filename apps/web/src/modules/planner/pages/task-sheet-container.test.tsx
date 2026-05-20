import type { TaskWithAssigneesRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { TaskSheetContainer } from './task-sheet-container';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWithQuery(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

function makeCreatedEvent(taskId: string) {
  return {
    id: '1',
    event_type: 'planner.task.created',
    event_version: 1,
    aggregate_type: 'planner.task',
    aggregate_id: taskId,
    tenant_id: 't',
    trace_id: null,
    caused_by_event_id: null,
    occurred_at: '2026-05-20T00:00:00Z',
    payload: {
      actor: { type: 'user', user_id: 'u' },
      group_id: 'g',
      after: {
        task_id: taskId,
        plan_id: 'p1',
        group_id: 'g',
        bucket_id: null,
        title: 'Ship M3 spec',
        description: '**Important** work',
        priority: 'urgent',
        due_at: null,
        skill_tags: [],
        review_state: null,
        sort_order: 1,
        created_by: 'u',
      },
    },
  };
}

describe('TaskSheetContainer', () => {
  it('renders title, description (markdown), properties, checklist, activity', async () => {
    const task: TaskWithAssigneesRow = makeTaskWithAssignees({
      id: 't1',
      title: 'Ship M3 spec',
      description: '**Important** work',
      priority: 'urgent',
      progress: 'in_progress',
      version: 1,
    });
    server.use(
      http.get('/api/planner/v1/tasks/t1', () => HttpResponse.json(task)),
      http.get('/api/planner/v1/tasks/t1/checklist', () =>
        HttpResponse.json({
          items: [
            {
              id: 'i1',
              task_id: 't1',
              label: 'Draft outline',
              checked: true,
              sort_order: 1,
              created_at: '',
              updated_at: '',
            },
            {
              id: 'i2',
              task_id: 't1',
              label: 'Write tests',
              checked: false,
              sort_order: 2,
              created_at: '',
              updated_at: '',
            },
          ],
        }),
      ),
      http.get('/api/planner/v1/tasks/t1/events', () =>
        HttpResponse.json({ events: [makeCreatedEvent('t1')] }),
      ),
    );

    renderWithQuery(<TaskSheetContainer taskId="t1" planId="p1" onClose={vi.fn()} />);

    expect(await screen.findByText('Ship M3 spec')).toBeInTheDocument();
    const strong = await screen.findByText('Important');
    expect(strong.tagName).toBe('STRONG');
    expect(await screen.findByDisplayValue('Draft outline')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Write tests')).toBeInTheDocument();
    expect(await screen.findByText('task.created')).toBeInTheDocument();
  });

  it('has no a11y violations on the happy path', async () => {
    const task: TaskWithAssigneesRow = makeTaskWithAssignees({
      id: 't1',
      title: 'Ship M3 spec',
      description: '**Important** work',
      priority: 'urgent',
      progress: 'in_progress',
      version: 1,
    });
    server.use(
      http.get('/api/planner/v1/tasks/t1', () => HttpResponse.json(task)),
      http.get('/api/planner/v1/tasks/t1/checklist', () =>
        HttpResponse.json({
          items: [
            {
              id: 'i1',
              task_id: 't1',
              label: 'Draft outline',
              checked: true,
              sort_order: 1,
              created_at: '',
              updated_at: '',
            },
          ],
        }),
      ),
      http.get('/api/planner/v1/tasks/t1/events', () =>
        HttpResponse.json({ events: [makeCreatedEvent('t1')] }),
      ),
    );

    const { container } = renderWithQuery(
      <TaskSheetContainer taskId="t1" planId="p1" onClose={vi.fn()} />,
    );
    await screen.findByText('Ship M3 spec');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('switches description to edit mode + saves the new value on Cmd+Enter', async () => {
    const task: TaskWithAssigneesRow = makeTaskWithAssignees({
      id: 't1',
      title: 'Ship M3 spec',
      description: '',
      priority: 'urgent',
      progress: 'in_progress',
      version: 1,
    });
    let patchedDescription: string | undefined;
    server.use(
      http.get('/api/planner/v1/tasks/t1', () => HttpResponse.json(task)),
      http.get('/api/planner/v1/tasks/t1/checklist', () => HttpResponse.json({ items: [] })),
      http.get('/api/planner/v1/tasks/t1/events', () => HttpResponse.json({ events: [] })),
      http.patch('/api/planner/v1/tasks/t1', async ({ request }) => {
        const body = (await request.json()) as { patch: { description: string } };
        patchedDescription = body.patch.description;
        return HttpResponse.json({ ...task, description: body.patch.description, version: 2 });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<TaskSheetContainer taskId="t1" planId="p1" onClose={vi.fn()} />);

    const placeholder = await screen.findByRole('button', { name: /click to add a description/i });
    await user.click(placeholder);

    const textarea = await screen.findByRole('textbox');
    await user.type(textarea, 'Hello');
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    await waitFor(() => expect(patchedDescription).toBe('Hello'));
  });
});
