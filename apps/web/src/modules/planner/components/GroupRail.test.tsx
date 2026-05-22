import type { GroupMemberRow } from '@seta/planner';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeGroup } from '../testing/fixtures';
import { GroupRail } from './GroupRail';

function makeMember(over: Partial<GroupMemberRow> = {}): GroupMemberRow {
  return {
    group_id: 'g1',
    user_id: over.user_id ?? `u-${Math.random()}`,
    role: over.role ?? 'member',
    display_name: over.display_name ?? 'Jane Doe',
    email: over.email ?? 'jane@example.test',
    added_at: '2026-03-15T00:00:00Z',
    added_by: 'admin',
    ...over,
  };
}

const baseGroup = makeGroup({
  id: 'g1',
  visibility: 'private',
  external_source: 'native',
  default_role: 'member',
  created_at: '2026-03-18T00:00:00Z',
});

describe('GroupRail', () => {
  it('renders Members section with top-N members (default 7)', () => {
    const members = Array.from({ length: 10 }, (_, i) =>
      makeMember({ user_id: `u${i}`, display_name: `User ${i}` }),
    );
    render(<GroupRail group={baseGroup} members={members} canManage onAddMember={vi.fn()} />);
    expect(screen.getByText('User 0')).toBeInTheDocument();
    expect(screen.getByText('User 6')).toBeInTheDocument();
    expect(screen.queryByText('User 7')).not.toBeInTheDocument();
    expect(screen.getByText(/See all 10 members/)).toBeInTheDocument();
  });

  it('hides the "Add" button when canManage=false', () => {
    render(
      <GroupRail
        group={baseGroup}
        members={[makeMember()]}
        canManage={false}
        onAddMember={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Add member/i })).not.toBeInTheDocument();
  });

  it('calls onAddMember when "Add" is clicked', async () => {
    const user = userEvent.setup();
    const onAddMember = vi.fn();
    render(
      <GroupRail group={baseGroup} members={[makeMember()]} canManage onAddMember={onAddMember} />,
    );
    await user.click(screen.getByRole('button', { name: /Add member/i }));
    expect(onAddMember).toHaveBeenCalled();
  });

  it("renders 'Recent activity' card with a loading hint when activityItems is undefined", () => {
    render(<GroupRail group={baseGroup} members={[]} canManage onAddMember={vi.fn()} />);
    expect(screen.getByText('Recent activity', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText(/Loading activity/)).toBeInTheDocument();
  });

  it("'Recent activity' shows an empty-state when activityItems is []", () => {
    render(
      <GroupRail
        group={baseGroup}
        members={[]}
        canManage
        onAddMember={vi.fn()}
        activityItems={[]}
      />,
    );
    expect(screen.getByText(/No activity in the last 7 days/)).toBeInTheDocument();
  });

  it("'Recent activity' renders each item with actor + verb + relative time", () => {
    render(
      <GroupRail
        group={baseGroup}
        members={[]}
        canManage
        onAddMember={vi.fn()}
        activityItems={[
          {
            event_id: 'e1',
            event_type: 'planner.task.created',
            verb: 'created task',
            target_title: 'Ship M3 spec',
            occurred_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            actor_user_id: 'u1',
            actor_display_name: 'Jane Doe',
          },
        ]}
      />,
    );
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('created task')).toBeInTheDocument();
    expect(screen.getByText('Ship M3 spec')).toBeInTheDocument();
  });

  it('Properties card shows Visibility/Source/Default role/Created', () => {
    render(<GroupRail group={baseGroup} members={[]} canManage onAddMember={vi.fn()} />);
    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('Visibility')).toBeInTheDocument();
    expect(screen.getByText('Source')).toBeInTheDocument();
    expect(screen.getByText('Default role')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Native')).toBeInTheDocument();
    expect(screen.getByText(/Mar 18, 2026/)).toBeInTheDocument();
  });

  it('does not show "See all" link when total members ≤ shownMemberCount', () => {
    render(
      <GroupRail
        group={baseGroup}
        members={[makeMember()]}
        canManage
        onAddMember={vi.fn()}
        shownMemberCount={7}
      />,
    );
    expect(screen.queryByText(/See all/)).not.toBeInTheDocument();
  });

  it('renders Owner pill with primary tint for role=owner', () => {
    const m = makeMember({ role: 'owner' });
    render(<GroupRail group={baseGroup} members={[m]} canManage onAddMember={vi.fn()} />);
    const pill = screen.getByText('Owner');
    expect(pill.className).toMatch(/bg-primary-tint/);
  });
});
