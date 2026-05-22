import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotificationListItem } from './notification-list-item';

const base = {
  id: '1',
  event_type: 'core.dev.sample',
  payload: { title: 'Hello', body: 'world' },
  created_at: new Date(Date.now() - 60_000).toISOString(),
  read_at: null,
};

describe('NotificationListItem', () => {
  it('renders title and body from payload', () => {
    render(<NotificationListItem notification={base} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('falls back to event_type when title is missing', () => {
    render(<NotificationListItem notification={{ ...base, payload: {} }} />);
    expect(screen.getByText('core.dev.sample')).toBeInTheDocument();
  });

  it('shows an unread indicator when read_at is null', () => {
    render(<NotificationListItem notification={base} />);
    expect(screen.getByTestId('notification-unread-indicator')).toBeInTheDocument();
  });

  it('hides the unread indicator when read_at is set', () => {
    render(<NotificationListItem notification={{ ...base, read_at: new Date().toISOString() }} />);
    expect(screen.queryByTestId('notification-unread-indicator')).not.toBeInTheDocument();
  });

  it('fires onMarkRead and onDismiss callbacks', async () => {
    const onMarkRead = vi.fn();
    const onDismiss = vi.fn();
    render(
      <NotificationListItem notification={base} onMarkRead={onMarkRead} onDismiss={onDismiss} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /mark as read/i }));
    expect(onMarkRead).toHaveBeenCalledWith('1');
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledWith('1');
  });

  it('renders the icon when provided', () => {
    render(<NotificationListItem notification={base} icon={<span data-testid="icon">★</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('calls onClick when the body region is clicked', async () => {
    const onClick = vi.fn();
    render(<NotificationListItem notification={base} onClick={onClick} />);
    await userEvent.click(screen.getByText('Hello'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('clicking the inline action buttons does NOT call onClick', async () => {
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    const onMarkRead = vi.fn();
    render(
      <NotificationListItem
        notification={base}
        onClick={onClick}
        onMarkRead={onMarkRead}
        onDismiss={onDismiss}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /mark as read/i }));
    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onMarkRead).toHaveBeenCalledWith('1');
    expect(onDismiss).toHaveBeenCalledWith('1');
    expect(onClick).not.toHaveBeenCalled();
  });
});
