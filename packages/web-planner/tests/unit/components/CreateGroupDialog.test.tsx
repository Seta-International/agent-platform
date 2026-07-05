import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CreateGroupDialog } from '../../../src/components/CreateGroupDialog';
import { makeGroup } from '../../../src/testing/fixtures';

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
    await user.click(screen.getByRole('combobox', { name: /Default member role/i }));
    await user.click(screen.getByRole('option', { name: 'Owner' }));
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

  it('does not create a second group when cmd+enter fires again before the first submission resolves (FUT-390)', async () => {
    const user = userEvent.setup();
    const captured: unknown[] = [];
    let releaseResponse!: () => void;
    const held = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    server.use(
      http.post('*/api/planner/v1/groups', async ({ request }) => {
        captured.push(await request.json());
        await held;
        return HttpResponse.json(makeGroup({ name: 'Hello' }), { status: 201 });
      }),
    );
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText(/Group name/i), 'Hello');
    await user.keyboard('{Meta>}{Enter}{Enter}{/Meta}');
    releaseResponse();
    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 20));
    expect(captured).toHaveLength(1);
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

  it('clicking Link… opens the M365 picker WITHOUT creating the group', async () => {
    const user = userEvent.setup();
    const created: unknown[] = [];
    server.use(
      http.post('*/api/planner/v1/groups', async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json(makeGroup({ id: 'g-new' }), { status: 201 });
      }),
      http.get('*/api/integrations/m365/groups/search', () => HttpResponse.json({ groups: [] })),
    );
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText(/Group name/i), 'Linked Group');
    await user.click(screen.getByRole('button', { name: /^Link…$/ }));

    // Picker opens…
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/Search Microsoft 365 groups/i)).toBeInTheDocument(),
    );
    // …but nothing is created yet — creation is deferred to "Create group".
    expect(created).toHaveLength(0);
  });

  it('selecting an M365 group then Create group creates the group AND links it', async () => {
    const user = userEvent.setup();
    const created: unknown[] = [];
    const linked: unknown[] = [];
    server.use(
      http.get('*/api/integrations/m365/groups/search', () =>
        HttpResponse.json({
          groups: [{ external_id: 'ext-1', display_name: 'Eng M365', mail_nickname: 'eng' }],
        }),
      ),
      http.post('*/api/planner/v1/groups', async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json(makeGroup({ id: 'g-new', name: 'Linked Group' }), { status: 201 });
      }),
      http.post('*/api/integrations/m365/groups/g-new/link', async ({ request }) => {
        linked.push(await request.json());
        return HttpResponse.json(makeGroup({ id: 'g-new' }));
      }),
    );
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText(/Group name/i), 'Linked Group');
    await user.click(screen.getByRole('button', { name: /^Link…$/ }));
    await user.type(screen.getByPlaceholderText(/Search Microsoft 365 groups/i), 'Eng');
    await user.click(await screen.findByText('Eng M365'));
    await user.click(screen.getByRole('button', { name: /^Link$/ }));

    // Still nothing created — only the selection was collected.
    expect(created).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Create group/i }));
    await waitFor(() => expect(created).toHaveLength(1));
    await waitFor(() => expect(linked).toHaveLength(1));
    expect(linked[0]).toMatchObject({ external_id: 'ext-1' });
  });

  it('prefills the empty Description from the selected M365 group', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/integrations/m365/groups/search', () =>
        HttpResponse.json({
          groups: [
            {
              external_id: 'ext-1',
              display_name: 'Eng M365',
              mail_nickname: 'eng',
              description: 'The engineering org',
            },
          ],
        }),
      ),
    );
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText(/Group name/i), 'X');
    await user.click(screen.getByRole('button', { name: /^Link…$/ }));
    await user.type(screen.getByPlaceholderText(/Search Microsoft 365 groups/i), 'Eng');
    await user.click(await screen.findByText('Eng M365'));
    await user.click(screen.getByRole('button', { name: /^Link$/ }));

    expect(screen.getByLabelText(/Description/i)).toHaveValue('The engineering org');
  });

  it('does NOT overwrite a description the user already typed', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/integrations/m365/groups/search', () =>
        HttpResponse.json({
          groups: [
            {
              external_id: 'ext-1',
              display_name: 'Eng M365',
              mail_nickname: 'eng',
              description: 'The engineering org',
            },
          ],
        }),
      ),
    );
    wrap(<CreateGroupDialog open onOpenChange={() => {}} />);

    await user.type(screen.getByLabelText(/Group name/i), 'X');
    await user.type(screen.getByLabelText(/Description/i), 'My own description');
    await user.click(screen.getByRole('button', { name: /^Link…$/ }));
    await user.type(screen.getByPlaceholderText(/Search Microsoft 365 groups/i), 'Eng');
    await user.click(await screen.findByText('Eng M365'));
    await user.click(screen.getByRole('button', { name: /^Link$/ }));

    // The user's text is preserved — the M365 description does not overwrite it.
    expect(screen.getByLabelText(/Description/i)).toHaveValue('My own description');
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
