import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatThreadRail } from './chat-thread-rail';

const groups = [
  {
    label: 'Today',
    items: [
      {
        id: 't1',
        title: 'Move Review tasks to Done',
        updatedAtLabel: '2m',
        active: true,
        hint: 'HITL',
      },
      { id: 't2', title: 'Plan next sprint', updatedAtLabel: '1h' },
    ],
  },
  {
    label: 'Earlier this week',
    items: [{ id: 't3', title: 'Reviewer assignments', updatedAtLabel: '2d' }],
  },
];

describe('<ChatThreadRail>', () => {
  it('renders the group headers and items', () => {
    render(
      <ChatThreadRail
        groups={groups}
        activeId="t1"
        onSelect={() => undefined}
        onNewThread={() => undefined}
        searchValue=""
        onSearchChange={() => undefined}
      />,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Earlier this week')).toBeInTheDocument();
    expect(screen.getByText('Move Review tasks to Done')).toBeInTheDocument();
  });

  it('calls onSelect on row click', () => {
    const onSelect = vi.fn();
    render(
      <ChatThreadRail
        groups={groups}
        activeId="t1"
        onSelect={onSelect}
        onNewThread={() => undefined}
        searchValue=""
        onSearchChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText('Plan next sprint'));
    expect(onSelect).toHaveBeenCalledWith('t2');
  });

  it('calls onNewThread on the new button', () => {
    const onNewThread = vi.fn();
    render(
      <ChatThreadRail
        groups={groups}
        activeId="t1"
        onSelect={() => undefined}
        onNewThread={onNewThread}
        searchValue=""
        onSearchChange={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /new/i }));
    expect(onNewThread).toHaveBeenCalledOnce();
  });
});
