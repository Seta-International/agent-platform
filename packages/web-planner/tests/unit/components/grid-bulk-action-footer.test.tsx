import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GridBulkActionFooter } from '../../../src/components/grid-bulk-action-footer';
import { useGroupMembers } from '../../../src/hooks/queries/use-group-members';

vi.mock('../../../src/hooks/queries/use-group-members', () => ({
  useGroupMembers: vi.fn(() => ({
    data: {
      members: [
        { user_id: 'u1', display_name: 'Ada Lovelace', email: 'ada@x.io' },
        { user_id: 'u2', display_name: 'Alan Turing', email: 'alan@x.io' },
      ],
    },
    isPending: false,
  })),
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
    // Disabled Astryx fields render aria-disabled + readOnly rather than the
    // native `disabled` attribute, so assert on that instead of just presence.
    const input = screen.getByPlaceholderText(/assign to/i);
    expect(input).toHaveAttribute('aria-disabled', 'true');
  });

  // Regression: mirrors the SkillPicker catalog-load gate. useGroupMembers'
  // search source is static, derived from the query's data — if the field
  // were interactive while the query is still pending, typing would search
  // an empty source. Gate the field on isPending so it can't be searched
  // before the member list has actually loaded.
  it('disables the assignee field while group members are loading, even when canAssign is true', () => {
    vi.mocked(useGroupMembers).mockReturnValueOnce({
      data: undefined,
      isPending: true,
    } as ReturnType<typeof useGroupMembers>);

    renderFooter();
    const input = screen.getByPlaceholderText(/assign to/i);
    expect(input).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('GridBulkActionFooter BucketMenu', () => {
  it('opens the Move popover and calls onMove with the picked bucket id, then closes', async () => {
    const onMove = vi.fn();
    render(
      <GridBulkActionFooter
        count={2}
        groupId="g1"
        bucketOptions={[
          { id: 'b1', name: 'Backlog' },
          { id: 'b2', name: 'Done' },
        ]}
        onMove={onMove}
        onAssign={vi.fn()}
        onSetDue={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    fireEvent.click(await screen.findByText('Backlog'));
    expect(onMove).toHaveBeenCalledWith('b1');
    // Astryx's Popover eagerly mounts `content` (hidden), so it stays in the DOM
    // after closing — assert hidden rather than absent.
    expect(screen.getByText('Backlog')).not.toBeVisible();
  });

  it('calls onMove with null via "No bucket"', async () => {
    const onMove = vi.fn();
    render(
      <GridBulkActionFooter
        count={2}
        groupId="g1"
        bucketOptions={[{ id: 'b1', name: 'Backlog' }]}
        onMove={onMove}
        onAssign={vi.fn()}
        onSetDue={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    fireEvent.click(await screen.findByText('No bucket'));
    expect(onMove).toHaveBeenCalledWith(null);
  });
});

describe('GridBulkActionFooter DueMenu', () => {
  it('opens the Set due popover and calls onSetDue with an ISO date when a date is picked', async () => {
    const user = userEvent.setup({ delay: null });
    const onSetDue = vi.fn();
    render(
      <GridBulkActionFooter
        count={2}
        groupId="g1"
        bucketOptions={[]}
        onMove={vi.fn()}
        onAssign={vi.fn()}
        onSetDue={onSetDue}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set due' }));
    const dateInput = await screen.findByLabelText('Due date');
    await user.type(dateInput, '2026-08-01');
    expect(onSetDue).toHaveBeenCalledWith(new Date('2026-08-01').toISOString());
    // Astryx's Popover eagerly mounts `content` (hidden), so it stays in the DOM
    // after closing — assert hidden rather than absent.
    expect(screen.getByLabelText('Due date')).not.toBeVisible();
  });

  it('calls onSetDue with null via "Clear due date"', async () => {
    const onSetDue = vi.fn();
    render(
      <GridBulkActionFooter
        count={2}
        groupId="g1"
        bucketOptions={[]}
        onMove={vi.fn()}
        onAssign={vi.fn()}
        onSetDue={onSetDue}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set due' }));
    fireEvent.click(await screen.findByText('Clear due date'));
    expect(onSetDue).toHaveBeenCalledWith(null);
  });
});
