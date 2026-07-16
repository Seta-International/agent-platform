import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '../../../src/groups/api/groups-client.ts';
import { GroupDetail } from '../../../src/groups/components/GroupDetail.tsx';

const updateGroupMock = vi.fn(async () => {});
const deleteGroupMock = vi.fn(async () => {});

vi.mock('../../../src/groups/api/groups-client.ts', () => ({
  setGroupRoles: async () => {},
  updateGroup: (id: string, body: { name?: string; description?: string }) =>
    updateGroupMock(id, body),
  deleteGroup: (id: string) => deleteGroupMock(id),
}));

const group: Group = {
  group_id: 'g1',
  slug: 'eng',
  name: 'Engineering',
  kind: 'custom',
  is_base: false,
  member_count: 1,
  roles: [],
};

function renderDetail(onDeleted: () => void = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GroupDetail group={group} onDeleted={onDeleted} />
    </QueryClientProvider>,
  );
}

// RenameDialog is a self-triggering Astryx `Dialog` (purpose="form" → role="dialog"). Astryx's
// Dialog always mounts the <dialog> element regardless of `isOpen`, so "closed" is asserted via
// the role leaving the accessibility tree (display:none), never via content unmounting. The
// group-delete AlertDialog below takes role="alertdialog", so the two never collide in a query.
describe('GroupDetail RenameDialog', () => {
  beforeEach(() => {
    updateGroupMock.mockClear();
  });

  it('is not exposed as a dialog until Edit is clicked', () => {
    renderDetail();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with the current name prefilled, and saves the edited name', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit group' })).toBeInTheDocument();
    const nameInput = within(dialog).getByLabelText('Name');
    expect(nameInput).toHaveValue('Engineering');

    await user.clear(nameInput);
    await user.type(nameInput, 'Platform Engineering');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateGroupMock).toHaveBeenCalledWith('g1', {
        name: 'Platform Engineering',
        description: '',
      }),
    );
    // Save succeeds → dialog closes.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes via Cancel without saving', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateGroupMock).not.toHaveBeenCalled();
  });
});

// The delete confirm is an Astryx `AlertDialog` (role="alertdialog") opened by the Delete button's
// own `isOpen` state — the button is rendered on exactly the same codepath as before, so it stays
// gated by whatever renders GroupDetail's action row.
describe('GroupDetail DeleteGroupButton', () => {
  beforeEach(() => {
    deleteGroupMock.mockClear();
  });

  it('is not exposed as an alertdialog until Delete is clicked', () => {
    renderDetail();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('opens the confirm with the group name and consequence copy', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const confirm = screen.getByRole('alertdialog');
    expect(
      within(confirm).getByRole('heading', { name: 'Delete “Engineering”?' }),
    ).toBeInTheDocument();
    expect(
      within(confirm).getByText(
        'Members lose the roles and product access this group grants. This can’t be undone.',
      ),
    ).toBeInTheDocument();
    expect(deleteGroupMock).not.toHaveBeenCalled();
  });

  it('closes via Cancel without deleting', async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const confirm = screen.getByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(deleteGroupMock).not.toHaveBeenCalled();
  });

  it('deletes the group and notifies the parent once confirmed', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    renderDetail(onDeleted);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const confirm = screen.getByRole('alertdialog');
    await user.click(within(confirm).getByRole('button', { name: 'Delete group' }));

    await waitFor(() => expect(deleteGroupMock).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });
});
