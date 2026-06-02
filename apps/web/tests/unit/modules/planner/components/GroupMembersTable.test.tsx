import type { GroupMemberRow } from '@seta/planner';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GroupMembersTable } from '../../../../../src/modules/planner/components/GroupMembersTable';
import { makeGroup } from '../../../../../src/modules/planner/testing/fixtures';

const nativeGroup = makeGroup({ id: 'g1', external_source: 'native' });
const linkedGroup = makeGroup({ id: 'g2', external_source: 'm365', external_id: 'graph-123' });

function member(over: Partial<GroupMemberRow> = {}): GroupMemberRow {
  return {
    group_id: 'g1',
    user_id: over.user_id ?? `u-${Math.random()}`,
    role: over.role ?? 'member',
    display_name: over.display_name ?? 'Jane Doe',
    email: over.email ?? 'jane@example.test',
    added_at: over.added_at ?? '2026-03-15T00:00:00Z',
    added_by: 'admin',
    ...over,
  };
}

describe('GroupMembersTable', () => {
  it('renders the column headers and one row per member', () => {
    render(
      <GroupMembersTable
        group={nativeGroup}
        members={[member({ display_name: 'Alice' })]}
        canManageRoles
        canRemoveMembers={false}
        onRoleChange={vi.fn()}
        onRemoveMember={vi.fn()}
        onRemoveMembers={vi.fn()}
      />,
    );
    // Column headers — use columnheader role to avoid collision with <option> text
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(
      expect.arrayContaining(['Member', 'Email', 'Role', 'Added']),
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders an editable role Select when canManageRoles + native group', () => {
    render(
      <GroupMembersTable
        group={nativeGroup}
        members={[member({ user_id: 'u1' })]}
        canManageRoles
        canRemoveMembers={false}
        onRoleChange={vi.fn()}
        onRemoveMember={vi.fn()}
        onRemoveMembers={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: /Change role/i })).toBeInTheDocument();
  });

  it('renders a static pill (not a Select) when canManageRoles=false', () => {
    render(
      <GroupMembersTable
        group={nativeGroup}
        members={[member({ role: 'owner' })]}
        canManageRoles={false}
        canRemoveMembers={false}
        onRoleChange={vi.fn()}
        onRemoveMember={vi.fn()}
        onRemoveMembers={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
  });

  it('renders a static pill (not a Select) for linked groups, even when canManageRoles=true', () => {
    render(
      <GroupMembersTable
        group={linkedGroup}
        members={[member()]}
        canManageRoles
        canRemoveMembers={false}
        onRoleChange={vi.fn()}
        onRemoveMember={vi.fn()}
        onRemoveMembers={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('calls onRoleChange when role is changed via Select', async () => {
    const user = userEvent.setup();
    const onRoleChange = vi.fn();
    render(
      <GroupMembersTable
        group={nativeGroup}
        members={[member({ user_id: 'u1', role: 'member' })]}
        canManageRoles
        canRemoveMembers={false}
        onRoleChange={onRoleChange}
        onRemoveMember={vi.fn()}
        onRemoveMembers={vi.fn()}
      />,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Change role/i }),
      screen.getByRole('option', { name: 'Owner' }),
    );
    expect(onRoleChange).toHaveBeenCalledWith({ user_id: 'u1', role: 'owner' });
  });

  it('tooltip for linked group shows "Managed in Microsoft 365" with Azure portal link', async () => {
    const user = userEvent.setup();
    render(
      <GroupMembersTable
        group={linkedGroup}
        members={[member()]}
        canManageRoles
        canRemoveMembers={false}
        onRoleChange={vi.fn()}
        onRemoveMember={vi.fn()}
        onRemoveMembers={vi.fn()}
      />,
    );
    const trigger = document.querySelector('[tabindex="0"]');
    expect(trigger).not.toBeNull();
    if (trigger) await user.hover(trigger as Element);
    await waitFor(() => {
      const items = screen.getAllByText('Managed in Microsoft 365');
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
    const links = await screen.findAllByRole('link', { name: /Open in Azure portal/i });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]?.getAttribute('href')).toContain('graph-123');
  });

  it('renders a Remove button per row when canRemoveMembers is true on a native group', async () => {
    const onRemoveMember = vi.fn();
    const m = member({ user_id: 'u1', display_name: 'Alice' });
    render(
      <GroupMembersTable
        group={nativeGroup}
        members={[m]}
        canManageRoles={false}
        canRemoveMembers
        onRoleChange={vi.fn()}
        onRemoveMember={onRemoveMember}
        onRemoveMembers={vi.fn()}
      />,
    );
    const removeBtn = screen.getByRole('button', { name: /^Remove$/i });
    expect(removeBtn).toBeInTheDocument();
    await userEvent.click(removeBtn);
    expect(onRemoveMember).toHaveBeenCalledWith(m);
  });

  it('does not render a Remove button for linked groups even when canRemoveMembers is true', () => {
    render(
      <GroupMembersTable
        group={linkedGroup}
        members={[member()]}
        canManageRoles={false}
        canRemoveMembers
        onRoleChange={vi.fn()}
        onRemoveMember={vi.fn()}
        onRemoveMembers={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Remove$/i })).not.toBeInTheDocument();
  });

  it('shows the bulk action bar and calls onRemoveMembers when rows are selected', async () => {
    const onRemoveMembers = vi.fn();
    const m1 = member({ user_id: 'u1', display_name: 'Alice' });
    const m2 = member({ user_id: 'u2', display_name: 'Bob' });
    render(
      <GroupMembersTable
        group={nativeGroup}
        members={[m1, m2]}
        canManageRoles={false}
        canRemoveMembers
        onRoleChange={vi.fn()}
        onRemoveMember={vi.fn()}
        onRemoveMembers={onRemoveMembers}
      />,
    );
    // Select first row via checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is "select all", subsequent ones are per-row
    const rowCheckbox = checkboxes[1];
    if (!rowCheckbox) throw new Error('No row checkbox found');
    await userEvent.click(rowCheckbox);
    // Bulk bar should now be visible
    expect(screen.getByText(/1 member selected/i)).toBeInTheDocument();
    // Click "Remove selected"
    await userEvent.click(screen.getByRole('button', { name: /Remove selected/i }));
    expect(onRemoveMembers).toHaveBeenCalledWith(['u1']);
  });
});
