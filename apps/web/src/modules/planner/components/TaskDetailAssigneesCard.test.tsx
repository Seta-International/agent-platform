import type { AssigneeRow, TaskWithAssigneesRow } from '@seta/planner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeTaskWithAssignees } from '../testing/fixtures';
import { computeAssigneeReorder } from './assignee-reorder';
import { TaskDetailAssigneesCard } from './TaskDetailAssigneesCard';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function assignee(over: Partial<AssigneeRow> = {}): AssigneeRow {
  return {
    user_id: 'u1',
    display_name: 'Alice',
    email: 'alice@x.test',
    availability_status: 'available',
    ooo_until: null,
    deactivated_at: null,
    ...over,
  };
}

function withAssignees(assignees: AssigneeRow[]): TaskWithAssigneesRow {
  return makeTaskWithAssignees({ id: 't1', assignees });
}

function renderWithClient(node: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('TaskDetailAssigneesCard', () => {
  it('renders one row per assignee with name', () => {
    const task = withAssignees([
      assignee({ user_id: 'u1', display_name: 'Alice' }),
      assignee({ user_id: 'u2', display_name: 'Bob' }),
      assignee({ user_id: 'u3', display_name: 'Carol' }),
    ]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('opens the user combobox and lists matches from listAdminUsers', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    server.use(
      http.get('/api/identity/v1/users', () =>
        HttpResponse.json({
          rows: [
            {
              user_id: 'u9',
              email: 'dora@x',
              name: 'Dora',
              status: 'active',
              role_slugs: [],
              sign_in_methods: [],
              last_seen_at: null,
              created_at: '',
            },
          ],
          total: 1,
        }),
      ),
    );

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" />);
    await user.click(screen.getByRole('button', { name: /Add assignee/i }));
    const search = screen.getByLabelText(/Search users/i);
    await user.type(search, 'dora');
    await waitFor(() => expect(screen.getByText('Dora')).toBeInTheDocument());
  });

  it('does not send sign_in_method or show hidden footer when plan is not linked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const capturedParams: Array<URLSearchParams> = [];
    server.use(
      http.get('/api/identity/v1/users', ({ request }) => {
        const url = new URL(request.url);
        capturedParams.push(url.searchParams);
        return HttpResponse.json({
          rows: [
            {
              user_id: 'u9',
              email: 'dora@x',
              name: 'Dora',
              status: 'active',
              role_slugs: [],
              sign_in_methods: ['credential'],
              last_seen_at: null,
              created_at: '',
            },
          ],
          total: 1,
        });
      }),
    );

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" isLinkedToM365={false} />);
    await user.click(screen.getByRole('button', { name: /Add assignee/i }));
    const searchInput = screen.getByLabelText(/Search users/i);
    await user.type(searchInput, 'd');

    await waitFor(() => expect(screen.getByText('Dora')).toBeInTheDocument());
    expect(capturedParams.length).toBeGreaterThanOrEqual(1);
    for (const params of capturedParams) {
      expect(params.get('sign_in_method')).toBeNull();
    }
    expect(screen.queryByText(/hidden — not in M365/)).not.toBeInTheDocument();
  });

  it('sends sign_in_method=microsoft and shows hidden footer when plan is linked to M365', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const capturedParams: Array<URLSearchParams> = [];
    server.use(
      http.get('/api/identity/v1/users', ({ request }) => {
        const url = new URL(request.url);
        capturedParams.push(url.searchParams);
        const isFiltered = url.searchParams.get('sign_in_method') === 'microsoft';
        return HttpResponse.json({
          rows: isFiltered
            ? [
                {
                  user_id: 'u9',
                  email: 'dora@m365',
                  name: 'Dora',
                  status: 'active',
                  role_slugs: [],
                  sign_in_methods: ['microsoft'],
                  last_seen_at: null,
                  created_at: '',
                },
              ]
            : [
                {
                  user_id: 'u9',
                  email: 'dora@m365',
                  name: 'Dora',
                  status: 'active',
                  role_slugs: [],
                  sign_in_methods: ['microsoft'],
                  last_seen_at: null,
                  created_at: '',
                },
                {
                  user_id: 'u10',
                  email: 'dan@x',
                  name: 'Dan',
                  status: 'active',
                  role_slugs: [],
                  sign_in_methods: ['credential'],
                  last_seen_at: null,
                  created_at: '',
                },
                {
                  user_id: 'u11',
                  email: 'don@x',
                  name: 'Don',
                  status: 'active',
                  role_slugs: [],
                  sign_in_methods: ['credential'],
                  last_seen_at: null,
                  created_at: '',
                },
              ],
          total: isFiltered ? 1 : 3,
        });
      }),
    );

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" isLinkedToM365={true} />);
    await user.click(screen.getByRole('button', { name: /Add assignee/i }));
    const searchInput = screen.getByLabelText(/Search users/i);
    await user.type(searchInput, 'd');

    await waitFor(() => expect(screen.getByText('Dora')).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText(/2 users hidden — not in M365/)).toBeInTheDocument(),
    );

    const microsoftCalls = capturedParams.filter((p) => p.get('sign_in_method') === 'microsoft');
    const unfilteredCalls = capturedParams.filter((p) => p.get('sign_in_method') === null);
    expect(microsoftCalls.length).toBeGreaterThanOrEqual(1);
    expect(unfilteredCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('does not show hidden footer when all users are M365-eligible', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    server.use(
      http.get('/api/identity/v1/users', () =>
        HttpResponse.json({
          rows: [
            {
              user_id: 'u9',
              email: 'dora@m365',
              name: 'Dora',
              status: 'active',
              role_slugs: [],
              sign_in_methods: ['microsoft'],
              last_seen_at: null,
              created_at: '',
            },
          ],
          total: 1,
        }),
      ),
    );

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" isLinkedToM365={true} />);
    await user.click(screen.getByRole('button', { name: /Add assignee/i }));
    const searchInput = screen.getByLabelText(/Search users/i);
    await user.type(searchInput, 'd');

    await waitFor(() => expect(screen.getByText('Dora')).toBeInTheDocument());
    expect(screen.queryByText(/hidden — not in M365/)).not.toBeInTheDocument();
  });

  it('calls moveToTopOfMyList when "Move to top of my list" is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const captured = vi.fn();
    server.use(
      http.put('/api/planner/v1/tasks/t1/assignee-priority', async () => {
        captured();
        return HttpResponse.json({ id: 't1', version: 2 });
      }),
    );
    const task = withAssignees([assignee()]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" />);
    await user.click(screen.getByRole('button', { name: /Move to top of my list/i }));
    await waitFor(() => expect(captured).toHaveBeenCalled());
  });
});

describe('computeAssigneeReorder', () => {
  it('produces the new order with the dragged user moved to destination', () => {
    const next = computeAssigneeReorder(['a', 'b', 'c'], 2, 0);
    expect(next).toEqual(['c', 'a', 'b']);
  });

  it('returns null when source equals destination', () => {
    expect(computeAssigneeReorder(['a', 'b'], 0, 0)).toBeNull();
  });
});
