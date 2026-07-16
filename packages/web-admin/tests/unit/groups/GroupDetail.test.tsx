import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '../../../src/groups/api/groups-client.ts';
import { GroupDetail } from '../../../src/groups/components/GroupDetail.tsx';

const updateGroupMock = vi.fn(async () => {});

vi.mock('../../../src/groups/api/groups-client.ts', () => ({
  setGroupRoles: async () => {},
  updateGroup: (id: string, body: { name?: string; description?: string }) =>
    updateGroupMock(id, body),
  deleteGroup: async () => {},
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

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <GroupDetail group={group} onDeleted={() => {}} />
    </QueryClientProvider>,
  );
}

// RenameDialog is a self-triggering Astryx `Dialog` (purpose="form" → role="dialog"). Astryx's
// Dialog always mounts the <dialog> element regardless of `isOpen`, so "closed" is asserted via
// the role leaving the accessibility tree (display:none), never via content unmounting. The
// separate group-delete AlertDialog (out of scope for this migration) is exercised by
// group-detail-scope.test.tsx and untouched here.
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
