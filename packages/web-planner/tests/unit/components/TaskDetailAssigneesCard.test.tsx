import type { AssigneeRow, TaskWithAssigneesRow } from '@seta/planner';
import type { SessionScopeProjection } from '@seta/web-identity';
import { SessionProvider } from '@seta/web-identity';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { computeAssigneeReorder } from '../../../src/components/assignee-reorder';
import { TaskDetailAssigneesCard } from '../../../src/components/TaskDetailAssigneesCard';
import { makeTaskWithAssignees } from '../../../src/testing/fixtures';

const fxSession: SessionScopeProjection = {
  user_id: 'u1',
  tenant_id: 't',
  tenant_name: 'Acme',
  tenant_slug: 'acme',
  email: 'me@acme.test',
  display_name: 'Me',
  role_summary: { roles: ['tenant.admin'], cross_tenant_read: false },
  permissions: [],
  cross_tenant_read: false,
  tenant_local_password_disabled: false,
};

const groupMembersHandler = http.get('/api/planner/v1/groups/g1/members', () =>
  HttpResponse.json({
    members: [
      {
        group_id: 'g1',
        user_id: 'u9',
        role: 'member',
        display_name: 'Dora',
        email: 'dora@x',
        added_at: '2026-05-20T00:00:00Z',
        added_by: 'u1',
      },
    ],
    total: 1,
  }),
);

const suggestionsHandler = http.get('/api/planner/v1/tasks/:taskId/assignee-suggestions', () =>
  HttpResponse.json([
    {
      user_id: 'u42',
      display_name: 'Zara',
      score: 0.92,
      skills: ['React', 'TypeScript'],
      exact_overlap: 1,
      open_task_count: 2,
      hours_available_this_week: null,
      timezone: null,
    },
  ]),
);

const server = setupServer(groupMembersHandler, suggestionsHandler);
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

function renderWithClient(node: ReactNode, session: SessionScopeProjection = fxSession) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider session={session}>{node}</SessionProvider>
    </QueryClientProvider>,
  );
}

describe('TaskDetailAssigneesCard', () => {
  it('renders one row per assignee with name', () => {
    const task = withAssignees([
      assignee({ user_id: 'u1', display_name: 'Alice' }),
      assignee({ user_id: 'u2', display_name: 'Bob' }),
      assignee({ user_id: 'u3', display_name: 'Carol' }),
    ]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('fetches nothing until the user clicks "Suggest assignees"', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const suggestHit = vi.fn();
    server.use(
      http.get('/api/planner/v1/tasks/:taskId/assignee-suggestions', () => {
        suggestHit();
        return HttpResponse.json([
          { user_id: 'u42', display_name: 'Zara', score: 0.92, skills: [], exact_overlap: 0 },
        ]);
      }),
    );

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);

    // The trigger is present; no suggestion request has fired and Zara isn't shown.
    const trigger = screen.getByRole('button', { name: 'Suggest' });
    expect(suggestHit).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /assign zara/i })).toBeNull();

    await user.click(trigger);

    // After the click, suggestions are fetched and rendered with a fit band + %.
    const suggestBtn = await screen.findByRole('button', { name: /assign zara/i });
    expect(suggestBtn).toHaveTextContent('Zara');
    expect(suggestBtn).toHaveTextContent('92%');
    expect(suggestHit).toHaveBeenCalled();
  });

  it('assigns an AI suggestion when its row is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const assignBody = vi.fn();
    server.use(
      http.post('/api/planner/v1/tasks/t1/assign', async ({ request }) => {
        assignBody(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    await user.click(screen.getByRole('button', { name: 'Suggest' }));
    await user.click(await screen.findByRole('button', { name: /assign zara/i }));

    await waitFor(() =>
      expect(assignBody).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u42' })),
    );
  });

  it('shows a no-match message when the trigger returns no suggestions', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    server.use(
      http.get('/api/planner/v1/tasks/:taskId/assignee-suggestions', () => HttpResponse.json([])),
    );

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    await user.click(screen.getByRole('button', { name: 'Suggest' }));

    expect(await screen.findByText(/no skill matches for this task yet/i)).toBeInTheDocument();
  });

  it('lists plain group members in the search picker', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    await user.click(screen.getByPlaceholderText(/search group members/i));

    const options = await screen.findAllByRole('option');
    expect(options.some((o) => o.textContent?.includes('Dora'))).toBe(true);
  });

  it('assigns the picked user and stays usable for another add', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const assignBody = vi.fn();
    server.use(
      http.post('/api/planner/v1/tasks/t1/assign', async ({ request }) => {
        assignBody(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    const input = screen.getByPlaceholderText(/search group members/i);
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: /Dora/ }));

    await waitFor(() =>
      expect(assignBody).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u9' })),
    );
    // field remains present for another add
    expect(screen.getByPlaceholderText(/search group members/i)).toBeInTheDocument();
  });

  it('excludes already-assigned users from the picker', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    // Two members so the exclusion is observable: Dora (assigned) must drop out
    // while Eve (free) remains selectable.
    server.use(
      http.get('/api/planner/v1/groups/g1/members', () =>
        HttpResponse.json({
          members: [
            {
              group_id: 'g1',
              user_id: 'u9',
              role: 'member',
              display_name: 'Dora',
              email: 'dora@x',
              added_at: '2026-05-20T00:00:00Z',
              added_by: 'u1',
            },
            {
              group_id: 'g1',
              user_id: 'u10',
              role: 'member',
              display_name: 'Eve',
              email: 'eve@x',
              added_at: '2026-05-20T00:00:00Z',
              added_by: 'u1',
            },
          ],
          total: 2,
        }),
      ),
    );

    const task = withAssignees([assignee({ user_id: 'u9', display_name: 'Dora' })]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    // Dora is already a token, so the Tokenizer hides its placeholder — open the
    // picker via the combobox role instead.
    await user.click(screen.getByRole('combobox', { name: /assignees/i }));

    const options = await screen.findAllByRole('option');
    expect(options.some((o) => o.textContent?.includes('Eve'))).toBe(true);
    expect(options.some((o) => o.textContent?.includes('Dora'))).toBe(false);
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
