import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EMPTY_FILTERS } from '../state/url-state';
import { PlanPage } from './plan-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWith(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

const planFixture = {
  id: 'p1',
  tenant_id: 't',
  group_id: 'g1',
  name: 'Q3 Launch',
  created_by: 'u',
  created_at: '',
  updated_at: '',
  deleted_at: null,
  version: 1,
};

const bucketTodo = {
  id: 'b1',
  tenant_id: 't',
  plan_id: 'p1',
  name: 'To do',
  sort_order: 1_000_000,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  version: 1,
};

const bucketDone = {
  id: 'b2',
  tenant_id: 't',
  plan_id: 'p1',
  name: 'Done',
  sort_order: 2_000_000,
  created_at: '',
  updated_at: '',
  deleted_at: null,
  version: 1,
};

const taskOne = {
  id: 't1',
  tenant_id: 't',
  plan_id: 'p1',
  bucket_id: 'b1',
  title: 'Wire up DnD',
  description: null,
  priority: 'medium' as const,
  progress: 'not_started' as const,
  review_state: null,
  skill_tags: [],
  due_at: null,
  sort_order: 1_000_000,
  created_by: 'u',
  created_at: '',
  updated_at: '',
  deleted_at: null,
  version: 1,
  assignees: [],
  labels: [],
  checklist_summary: { total: 0, checked: 0 },
};

function seedBoardHandlers() {
  return [
    http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(planFixture)),
    http.get('*/api/planner/v1/plans/p1/buckets', () =>
      HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
    ),
    http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [taskOne] })),
    http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
  ];
}

describe('PlanPage', () => {
  it('renders the board skeleton while pending', () => {
    server.use(
      http.get('*/api/planner/v1/plans/p1', async () => {
        await new Promise((r) => setTimeout(r, 1_000));
        return HttpResponse.json(planFixture);
      }),
      http.get('*/api/planner/v1/plans/p1/buckets', () => HttpResponse.json({ buckets: [] })),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
    );
    renderWith(
      <PlanPage
        planId="p1"
        filters={EMPTY_FILTERS}
        onFiltersChange={() => {}}
        onOpenTask={() => {}}
        view="board"
        onViewChange={() => {}}
      />,
    );
    expect(screen.getByTestId('board-skeleton')).toBeInTheDocument();
  });

  it('renders buckets and task cards from the API', async () => {
    server.use(...seedBoardHandlers());
    renderWith(
      <PlanPage
        planId="p1"
        filters={EMPTY_FILTERS}
        onFiltersChange={() => {}}
        onOpenTask={() => {}}
        view="board"
        onViewChange={() => {}}
      />,
    );
    expect(await screen.findByText('To do')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Wire up DnD')).toBeInTheDocument();
  });

  it('uses virtualized list when bucket has > 50 cards', async () => {
    const manyTasks = Array.from({ length: 60 }, (_, i) => ({
      ...taskOne,
      id: `t${i}`,
      sort_order: i,
    }));
    server.use(
      http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(planFixture)),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: manyTasks })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
    );
    renderWith(
      <PlanPage
        planId="p1"
        filters={EMPTY_FILTERS}
        onFiltersChange={() => {}}
        onOpenTask={() => {}}
        view="board"
        onViewChange={() => {}}
      />,
    );
    expect(await screen.findByTestId('virtualized-bucket-list')).toBeInTheDocument();
  });

  it('has no a11y violations on the happy path', async () => {
    server.use(...seedBoardHandlers());
    const { container } = renderWith(
      <PlanPage
        planId="p1"
        filters={EMPTY_FILTERS}
        onFiltersChange={() => {}}
        onOpenTask={() => {}}
        view="board"
        onViewChange={() => {}}
      />,
    );
    await screen.findByText('To do');
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('board card body renders PreviewBody content for tasks with a description', async () => {
    const richTask = {
      ...taskOne,
      id: 't-desc',
      title: 'With body',
      description: 'Ship the release notes by Friday',
      preview_type: 'automatic',
    };
    server.use(
      http.get('*/api/planner/v1/plans/p1', () => HttpResponse.json(planFixture)),
      http.get('*/api/planner/v1/plans/p1/buckets', () =>
        HttpResponse.json({ buckets: [bucketTodo, bucketDone] }),
      ),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [richTask] })),
      http.get('*/api/planner/v1/plans/p1/labels', () => HttpResponse.json({ labels: [] })),
    );
    renderWith(
      <PlanPage
        planId="p1"
        filters={EMPTY_FILTERS}
        onFiltersChange={() => {}}
        onOpenTask={() => {}}
        view="board"
        onViewChange={() => {}}
      />,
    );

    expect(await screen.findByText('Ship the release notes by Friday')).toBeInTheDocument();
    expect(screen.getByText('picked from description')).toBeInTheDocument();
  });

  it('quick-create on a bucket fires createTask with the typed title', async () => {
    const captured = vi.fn();
    server.use(
      ...seedBoardHandlers(),
      http.post('*/api/planner/v1/tasks', async ({ request }) => {
        const body = (await request.json()) as { title: string; bucket_id?: string };
        captured(body);
        return HttpResponse.json({
          ...taskOne,
          id: 't-new',
          title: body.title,
          bucket_id: body.bucket_id ?? null,
        });
      }),
    );
    renderWith(
      <PlanPage
        planId="p1"
        filters={EMPTY_FILTERS}
        onFiltersChange={() => {}}
        onOpenTask={() => {}}
        view="board"
        onViewChange={() => {}}
      />,
    );

    await screen.findByText('To do');
    const user = userEvent.setup();
    // Two quick-create buttons exist (one per bucket); the first belongs to "To do".
    const addButtons = screen.getAllByRole('button', { name: /\+ Add a task/ });
    await user.click(addButtons[0]!);
    const input = await screen.findByPlaceholderText('Add a task…');
    await user.type(input, 'New task from test');
    await user.keyboard('{Enter}');

    expect(captured).toHaveBeenCalledTimes(1);
    expect(captured.mock.calls[0]![0]).toMatchObject({
      title: 'New task from test',
      bucket_id: 'b1',
      plan_id: 'p1',
    });
  });
});
