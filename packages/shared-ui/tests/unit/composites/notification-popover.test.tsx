import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationListItemNotification } from '../../../src/composites/notification-list-item';
import { NotificationPopover } from '../../../src/composites/notification-popover';

const items = [
  {
    id: 'a',
    event_type: 't',
    payload: { title: 'A' },
    created_at: new Date().toISOString(),
    read_at: null,
  },
  {
    id: 'b',
    event_type: 't',
    payload: { title: 'B' },
    created_at: new Date().toISOString(),
    read_at: 'now',
  },
];

const trigger = <button type="button">Open</button>;

describe('NotificationPopover', () => {
  async function openPopover() {
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
  }

  it('renders items after opening', async () => {
    render(
      <NotificationPopover
        trigger={trigger}
        items={items}
        hasMore={false}
        unreadCount={1}
        onMarkAll={() => {}}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    await openPopover();
    const all = screen.getAllByRole('article');
    expect(all[0]).toHaveTextContent('A');
    expect(all[1]).toHaveTextContent('B');
  });

  it('shows empty state when items is empty', async () => {
    render(
      <NotificationPopover
        trigger={trigger}
        items={[]}
        hasMore={false}
        unreadCount={0}
        onMarkAll={() => {}}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    await openPopover();
    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });

  it('disables Mark all when unreadCount is 0', async () => {
    render(
      <NotificationPopover
        trigger={trigger}
        items={items}
        hasMore={false}
        unreadCount={0}
        onMarkAll={() => {}}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    await openPopover();
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeDisabled();
  });

  it('calls onMarkAll when the button is clicked', async () => {
    const onMarkAll = vi.fn();
    render(
      <NotificationPopover
        trigger={trigger}
        items={items}
        hasMore={false}
        unreadCount={2}
        onMarkAll={onMarkAll}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    await openPopover();
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(onMarkAll).toHaveBeenCalled();
  });

  it('uses renderItem when provided for each notification', async () => {
    const customItems: NotificationListItemNotification[] = [
      {
        id: 'n-1',
        event_type: 'planner.task.assigned',
        payload: { title: 'T1' },
        created_at: new Date().toISOString(),
        read_at: null,
      },
      {
        id: 'n-2',
        event_type: 'planner.plan.deleted',
        payload: { title: 'T2' },
        created_at: new Date().toISOString(),
        read_at: null,
      },
    ];
    render(
      <NotificationPopover
        trigger={trigger}
        items={customItems}
        hasMore={false}
        unreadCount={0}
        onMarkAll={() => {}}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
        renderItem={(n) => <div data-testid={`custom-${n.id}`}>{n.event_type}</div>}
      />,
    );
    await openPopover();
    expect(screen.getByTestId('custom-n-1')).toHaveTextContent('planner.task.assigned');
    expect(screen.getByTestId('custom-n-2')).toHaveTextContent('planner.plan.deleted');
  });

  it('shows a Load more button when hasMore is true', async () => {
    render(
      <NotificationPopover
        trigger={trigger}
        items={items}
        hasMore
        unreadCount={1}
        onMarkAll={() => {}}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    await openPopover();
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });
});
