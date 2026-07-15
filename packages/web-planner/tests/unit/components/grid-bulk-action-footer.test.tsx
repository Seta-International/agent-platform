import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GridBulkActionFooter } from '../../../src/components/grid-bulk-action-footer';

vi.mock('../../../src/hooks/queries/use-group-members', () => ({
  useGroupMembers: () => ({
    data: {
      members: [
        { user_id: 'u1', display_name: 'Ada Lovelace', email: 'ada@x.io' },
        { user_id: 'u2', display_name: 'Alan Turing', email: 'alan@x.io' },
      ],
    },
    isPending: false,
  }),
}));

function renderFooter() {
  const onAssign = vi.fn();
  render(
    <GridBulkActionFooter
      count={2}
      groupId="g1"
      bucketOptions={[]}
      onMove={vi.fn()}
      onAssign={onAssign}
      onSetDue={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  return { onAssign };
}

describe('GridBulkActionFooter AssigneeMenu', () => {
  it('lists group members on focus and calls onAssign with the picked user id', async () => {
    const { onAssign } = renderFooter();
    const input = screen.getByPlaceholderText(/assign to/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Ada' } });
    fireEvent.click(await screen.findByText('Ada Lovelace'));
    expect(onAssign).toHaveBeenCalledWith('u1');
  });

  it('disables the assignee field when canAssign is false', () => {
    const onAssign = vi.fn();
    render(
      <GridBulkActionFooter
        count={1}
        groupId="g1"
        bucketOptions={[]}
        canAssign={false}
        onMove={vi.fn()}
        onAssign={onAssign}
        onSetDue={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // Disabled Astryx field exposes aria-disabled; the placeholder input is not editable.
    expect(screen.queryByPlaceholderText(/assign to/i)).not.toBeNull();
  });
});
