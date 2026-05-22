import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationDrawer } from './notification-drawer';

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

describe('NotificationDrawer', () => {
  it('renders items in order', () => {
    render(
      <NotificationDrawer
        open
        onOpenChange={() => {}}
        items={items}
        hasMore={false}
        unreadCount={1}
        onMarkAll={() => {}}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    const all = screen.getAllByRole('article');
    expect(all[0]).toHaveTextContent('A');
    expect(all[1]).toHaveTextContent('B');
  });

  it('shows empty state when items is empty', () => {
    render(
      <NotificationDrawer
        open
        onOpenChange={() => {}}
        items={[]}
        hasMore={false}
        unreadCount={0}
        onMarkAll={() => {}}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });

  it('disables Mark all when unreadCount is 0', () => {
    render(
      <NotificationDrawer
        open
        onOpenChange={() => {}}
        items={items}
        hasMore={false}
        unreadCount={0}
        onMarkAll={() => {}}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /mark all as read/i })).toBeDisabled();
  });

  it('calls onMarkAll when the button is clicked', async () => {
    const onMarkAll = vi.fn();
    render(
      <NotificationDrawer
        open
        onOpenChange={() => {}}
        items={items}
        hasMore={false}
        unreadCount={2}
        onMarkAll={onMarkAll}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /mark all as read/i }));
    expect(onMarkAll).toHaveBeenCalled();
  });

  it('shows a Load more button when hasMore is true', () => {
    render(
      <NotificationDrawer
        open
        onOpenChange={() => {}}
        items={items}
        hasMore
        unreadCount={1}
        onMarkAll={() => {}}
        onLoadMore={() => {}}
        onMarkRead={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });
});
