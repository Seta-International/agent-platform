import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TrashPage } from './trash-page';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TrashPage />
    </QueryClientProvider>,
  );
}

describe('TrashPage', () => {
  it('shows empty state when trash is empty', async () => {
    server.use(
      http.get('*/api/planner/v1/groups', () => HttpResponse.json({ groups: [] })),
      http.get('*/api/planner/v1/plans', () => HttpResponse.json({ plans: [] })),
      http.get('*/api/planner/v1/tasks', () => HttpResponse.json({ tasks: [] })),
    );
    renderPage();
    expect(await screen.findByText(/Trash is empty/i)).toBeInTheDocument();
  });

  it('lists deleted items + supports Restore', async () => {
    server.use(
      http.get('*/api/planner/v1/groups', () => HttpResponse.json({ groups: [] })),
      http.get('*/api/planner/v1/plans', () => HttpResponse.json({ plans: [] })),
      http.get('*/api/planner/v1/tasks', () =>
        HttpResponse.json({
          tasks: [
            {
              id: 't1',
              tenant_id: 't',
              plan_id: 'p1',
              bucket_id: null,
              title: 'Old task',
              description: null,
              priority: 'medium',
              progress: 'not_started',
              review_state: null,
              skill_tags: [],
              due_at: null,
              sort_order: 1,
              created_by: 'u',
              created_at: '',
              updated_at: '',
              deleted_at: '2026-05-15T00:00:00Z',
              version: 1,
              assignees: [],
              labels: [],
              checklist_summary: { total: 0, checked: 0 },
            },
          ],
        }),
      ),
      http.post('*/api/planner/v1/tasks/t1/restore', () =>
        HttpResponse.json({ id: 't1', deleted_at: null }),
      ),
    );
    renderPage();
    expect(await screen.findByText('Old task')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /restore/i }));
    await waitFor(() => expect(screen.queryByText('Old task')).toBeInTheDocument());
  });
});
