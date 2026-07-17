import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateGroupDialog } from '../../../src/groups/components/CreateGroupDialog.tsx';

const createGroupMock = vi.fn(async () => ({ group_id: 'g-new' }));

vi.mock('../../../src/groups/api/groups-client.ts', () => ({
  createGroup: (body: unknown) => createGroupMock(body),
}));

function renderDialog(onCreated = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CreateGroupDialog onCreated={onCreated} />
    </QueryClientProvider>,
  );
  return { onCreated };
}

// CreateGroupDialog is self-triggering: the "New group" Button is now a plain sibling of
// Astryx's `Dialog` (no more DialogTrigger). purpose="form" → role="dialog". Dialog always
// mounts regardless of `isOpen`, so "closed" is asserted via the role leaving the a11y tree.
describe('CreateGroupDialog', () => {
  beforeEach(() => {
    createGroupMock.mockClear();
  });

  it('is not exposed as a dialog until "New group" is clicked', () => {
    renderDialog();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with heading "Create group", derives the slug, and creates on submit', async () => {
    const user = userEvent.setup();
    const { onCreated } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'New group' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Create group' })).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Name'), 'HR Team');
    expect(within(dialog).getByLabelText('Slug')).toHaveValue('hr-team');

    await user.click(within(dialog).getByRole('button', { name: 'Create group' }));

    await waitFor(() =>
      expect(createGroupMock).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'hr-team', name: 'HR Team' }),
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('g-new'));
    // Create succeeds → dialog closes.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes via Cancel without creating', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'New group' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createGroupMock).not.toHaveBeenCalled();
  });
});
