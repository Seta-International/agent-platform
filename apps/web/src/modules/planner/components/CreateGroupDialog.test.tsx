import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { makeGroup } from '../testing/fixtures';
import { CreateGroupDialog } from './CreateGroupDialog';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);
}

describe('CreateGroupDialog', () => {
  it('renders the live preview tile that updates as name + theme change', async () => {
    const user = userEvent.setup();
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);
    // Theme defaults to blue; click green
    await user.click(screen.getByRole('button', { name: 'green' }));
    // Type a name; preview tile derives initials from the name
    await user.type(screen.getByLabelText(/Group name/i), 'Hello World');
    // The tile is aria-hidden, so we can't assert by name; assert the initials in the tree:
    expect(screen.getByText('HW')).toBeInTheDocument();
  });

  it('submits name + description + theme + visibility + default_role', async () => {
    const user = userEvent.setup();
    const captured: unknown[] = [];
    server.use(
      http.post('*/api/planner/v1/groups', async ({ request }) => {
        captured.push(await request.json());
        return HttpResponse.json(makeGroup({ name: 'X' }), { status: 201 });
      }),
    );
    const onOpenChange = vi.fn();
    wrap(<CreateGroupDialog open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText(/Group name/i), 'Customer Success');
    await user.type(screen.getByLabelText(/Description/i), 'Post-sale work');
    await user.click(screen.getByRole('button', { name: 'green' }));
    await user.click(screen.getByRole('radio', { name: /Workspace/i }));
    await user.selectOptions(screen.getByLabelText(/Default member role/i), 'owner');
    await user.click(screen.getByRole('button', { name: /Create group/i }));
    await waitFor(() => expect(captured.length).toBe(1));
    expect(captured[0]).toMatchObject({
      name: 'Customer Success',
      description: 'Post-sale work',
      theme: 'green',
      visibility: 'public',
      default_role: 'owner',
    });
  });

  it('cmd+enter submits the form', async () => {
    const user = userEvent.setup();
    const captured: unknown[] = [];
    server.use(
      http.post('*/api/planner/v1/groups', async ({ request }) => {
        captured.push(await request.json());
        return HttpResponse.json(makeGroup({ name: 'X' }), { status: 201 });
      }),
    );
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText(/Group name/i), 'Hello');
    await user.keyboard('{Meta>}{Enter}{/Meta}');
    await waitFor(() => expect(captured.length).toBe(1));
  });

  it('visibility radio cards toggle and reflect aria-checked', async () => {
    const user = userEvent.setup();
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);
    expect(screen.getByRole('radio', { name: /Private/i })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: /Workspace/i }));
    expect(screen.getByRole('radio', { name: /Workspace/i })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /Private/i })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('Link group button is disabled with a "Available after sync goes live" tooltip', async () => {
    const user = userEvent.setup();
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);
    const btn = screen.getByRole('button', { name: /Link group/i });
    expect(btn).toBeDisabled();
    // hover to show tooltip
    await user.hover(btn);
    await waitFor(() => {
      const matches = screen.getAllByText(/Available after sync goes live/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('when starter-plan is checked, fires createPlan on submit', async () => {
    const user = userEvent.setup();
    const planCaptured: unknown[] = [];
    server.use(
      http.post('*/api/planner/v1/groups', async () =>
        HttpResponse.json(makeGroup({ id: 'g-1', name: 'X' }), { status: 201 }),
      ),
      http.post('*/api/planner/v1/plans', async ({ request }) => {
        planCaptured.push(await request.json());
        return HttpResponse.json(
          { id: 'p-1', name: 'X starter plan', group_id: 'g-1' },
          {
            status: 201,
          },
        );
      }),
    );
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText(/Group name/i), 'X');
    await user.click(screen.getByLabelText(/Create a starter plan/i));
    await user.click(screen.getByRole('button', { name: /Create group/i }));
    await waitFor(() => expect(planCaptured.length).toBe(1));
    expect(planCaptured[0]).toMatchObject({ group_id: 'g-1', name: expect.stringContaining('X') });
  });
});
