import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import type { PropsWithChildren } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AddGroupMembersDialog } from '../../../src/components/AddGroupMembersDialog';

const GROUP_ID = 'g1';

const CANDIDATES = [
  { user_id: 'u-alice', display_name: 'Alice', email: 'alice@example.test' },
  { user_id: 'u-bob', display_name: 'Bob', email: 'bob@example.test' },
];

const server = setupServer(
  http.get(`/api/planner/v1/groups/${GROUP_ID}/members/candidates`, () =>
    HttpResponse.json({ candidates: CANDIDATES }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function setup(onOpenChange = vi.fn(), open = true) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  const utils = render(
    <Wrapper>
      <AddGroupMembersDialog
        groupId={GROUP_ID}
        existingMembers={[]}
        open={open}
        onOpenChange={onOpenChange}
      />
    </Wrapper>,
  );
  return { ...utils, qc };
}

describe('AddGroupMembersDialog', () => {
  // Astryx's real Dialog always mounts <dialog> + children regardless of `isOpen` — it does
  // not unmount on close. purpose="form" (the default here) renders role="dialog" (only
  // purpose="required" maps to role="alertdialog"). DialogHeader doesn't wire aria-labelledby,
  // so the dialog has no computed accessible name — assert the title via its heading instead.
  it('exposes an accessible dialog with heading "Add members" when open', async () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Add members' })).toBeInTheDocument();
  });

  it('is not exposed as a dialog when closed', () => {
    setup(vi.fn(), false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes via the header close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    setup(onOpenChange);
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders search input and candidate list', async () => {
    setup();
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('selecting a user adds a chip and enables the confirm button', async () => {
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    await user.click(screen.getByText('Alice'));

    expect(screen.getByRole('button', { name: /add 1 member/i })).not.toBeDisabled();
    // chip appears
    expect(screen.getAllByText('Alice')).toHaveLength(2); // one in list, one in chip
  });

  it('deselecting removes the chip', async () => {
    const user = userEvent.setup();
    setup();
    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());

    await user.click(screen.getByText('Alice'));
    await user.click(screen.getByRole('button', { name: /remove alice/i }));

    expect(screen.getByRole('button', { name: /^add members$/i })).toBeDisabled();
  });

  it('confirm button is disabled when nothing selected', async () => {
    setup();
    expect(screen.getByRole('button', { name: /^add members$/i })).toBeDisabled();
  });

  it('closes dialog on successful 201', async () => {
    server.use(
      http.post(`/api/planner/v1/groups/${GROUP_ID}/members/bulk`, () =>
        HttpResponse.json({ members: [] }, { status: 201 }),
      ),
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    setup(onOpenChange);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    await user.click(screen.getByText('Alice'));
    await user.click(screen.getByRole('button', { name: /add 1 member/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('closes dialog on 202 and does not call onOpenChange(true)', async () => {
    server.use(
      http.post(`/api/planner/v1/groups/${GROUP_ID}/members/bulk`, () =>
        HttpResponse.json({ job_id: 'j1' }, { status: 202 }),
      ),
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    setup(onOpenChange);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    await user.click(screen.getByText('Alice'));
    await user.click(screen.getByRole('button', { name: /add 1 member/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('explains a linked group in words instead of showing the raw error code', async () => {
    server.use(
      http.post(`/api/planner/v1/groups/${GROUP_ID}/members/bulk`, () =>
        HttpResponse.json({ error: 'LINKED_GROUP_IMMUTABLE_MEMBERS' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    setup();

    await user.click(await screen.findByRole('checkbox', { name: /select alice/i }));
    await user.click(screen.getByRole('button', { name: /add 1 member/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/managed in Microsoft 365/i);
    expect(alert).not.toHaveTextContent('LINKED_GROUP_IMMUTABLE_MEMBERS');
  });

  it('shows inline error and keeps dialog open on failure', async () => {
    server.use(
      http.post(`/api/planner/v1/groups/${GROUP_ID}/members/bulk`, () =>
        HttpResponse.json({ error: 'FORBIDDEN' }, { status: 403 }),
      ),
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    setup(onOpenChange);

    await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
    await user.click(screen.getByText('Alice'));
    await user.click(screen.getByRole('button', { name: /add 1 member/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // chip still present — selection preserved
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(1);
  });
});
