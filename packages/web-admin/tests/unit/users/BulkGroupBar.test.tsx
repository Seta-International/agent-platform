import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BulkGroupBar } from '../../../src/users/components/BulkGroupBar.tsx';

vi.mock('../../../src/groups/hooks/useGroups.ts', () => ({
  useGroupsQuery: vi.fn(),
  useGroupMembersMutations: vi.fn(),
}));

async function setup(opts: { addMutate?: ReturnType<typeof vi.fn> } = {}) {
  const hooks = await import('../../../src/groups/hooks/useGroups.ts');
  (hooks.useGroupsQuery as ReturnType<typeof vi.fn>).mockReturnValue({
    data: [{ group_id: 'g1', slug: 'eng', name: 'Engineering', roles: [] }],
  });
  (hooks.useGroupMembersMutations as ReturnType<typeof vi.fn>).mockReturnValue({
    add: { mutate: opts.addMutate ?? vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
  });
}

// BulkGroupBar's confirm dialog is parent-controlled (`confirming`/`setConfirming`), mapped to
// `isOpen`/`onOpenChange` at the `<Dialog>` call site. purpose="form" (not "required"): adding
// people to a group is reversible — they can be removed from the group afterward — matching the
// plan's "archive M365 group" precedent rather than a terminal/destructive action.
describe('BulkGroupBar', () => {
  it('is not exposed as a dialog until "Add to group" is clicked', async () => {
    await setup();
    render(<BulkGroupBar selectedUserIds={['u1', 'u2']} onClearSelection={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with heading "Add to group?", confirms, and clears selection on success', async () => {
    const user = userEvent.setup();
    const addMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) =>
      opts?.onSuccess?.(),
    );
    await setup({ addMutate });
    const onClearSelection = vi.fn();
    render(<BulkGroupBar selectedUserIds={['u1', 'u2']} onClearSelection={onClearSelection} />);

    await user.click(screen.getByRole('combobox', { name: /^group$/i }));
    await user.click(await screen.findByRole('option', { name: /engineering/i }));

    await user.click(screen.getByRole('button', { name: 'Add to group' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Add to group?' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Add 2 people to “Engineering”/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Add to group' }));

    expect(addMutate).toHaveBeenCalledWith(
      { id: 'g1', user_ids: ['u1', 'u2'] },
      expect.any(Object),
    );
    expect(onClearSelection).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes via Cancel without adding', async () => {
    const user = userEvent.setup();
    const addMutate = vi.fn();
    await setup({ addMutate });
    render(<BulkGroupBar selectedUserIds={['u1']} onClearSelection={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: /^group$/i }));
    await user.click(await screen.findByRole('option', { name: /engineering/i }));
    await user.click(screen.getByRole('button', { name: 'Add to group' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(addMutate).not.toHaveBeenCalled();
  });
});
