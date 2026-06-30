import type { AssigneeRow, TaskWithAssigneesRow } from '@seta/planner';
import { Dialog, DialogContent, DialogTitle } from '@seta/shared-ui';
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
  accessible_group_ids: ['g1'],
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

const server = setupServer(groupMembersHandler);
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

function renderInModalDialog(node: ReactNode, session: SessionScopeProjection = fxSession) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider session={session}>
        <Dialog open>
          <DialogContent hideClose unstyled onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogTitle className="sr-only">Task</DialogTitle>
            {node}
          </DialogContent>
        </Dialog>
      </SessionProvider>
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

  it('lists group members when the picker is first opened with an empty search', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    await user.click(screen.getByRole('button', { name: /Add assignee/i }));

    await waitFor(() => expect(screen.getByText('Dora')).toBeInTheDocument());
  });

  it('filters group members when searching', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
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
              display_name: 'Dan',
              email: 'dan@x',
              added_at: '2026-05-20T00:00:00Z',
              added_by: 'u1',
            },
          ],
          total: 2,
        }),
      ),
    );

    const task = withAssignees([]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    await user.click(screen.getByRole('button', { name: /Add assignee/i }));
    const search = screen.getByLabelText(/Search group members/i);
    await user.type(search, 'dan');
    await waitFor(() => {
      expect(screen.getByText('Dan')).toBeInTheDocument();
      expect(screen.queryByText('Dora')).not.toBeInTheDocument();
    });
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
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    await user.click(screen.getByRole('button', { name: /Move to top of my list/i }));
    await waitFor(() => expect(captured).toHaveBeenCalled());
  });

  it('hides "Move to top of my list" when the current user is not assigned', () => {
    const task = withAssignees([assignee({ user_id: 'u-other', display_name: 'Other' })]);
    renderWithClient(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    expect(screen.queryByRole('button', { name: /Move to top of my list/i })).toBeNull();
  });

  it('inside modal Dialog: opens picker via trigger click and assigns a group member', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const assignMutate = vi.fn();
    server.use(

      http.post('/api/planner/v1/tasks/t1/assign', async () => {
        assignMutate();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const task = withAssignees([]);
    renderInModalDialog(<TaskDetailAssigneesCard task={task} planId="p1" groupId="g1" />);
    await user.click(screen.getByRole('button', { name: /Add assignee/i }));
    await waitFor(() => expect(screen.getByText('Dora')).toBeInTheDocument());
    await user.click(screen.getByRole('option', { name: /Dora/i }));
    await waitFor(() => expect(assignMutate).toHaveBeenCalledOnce());
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
