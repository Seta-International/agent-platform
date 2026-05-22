import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationDrawerContainer } from './NotificationDrawerContainer';

vi.mock('../api/client', () => ({
  notificationsClient: {
    list: vi.fn(async () => ({
      items: [
        {
          id: '1',
          event_type: 't',
          payload: { title: 'Hi' },
          created_at: new Date().toISOString(),
          read_at: null,
        },
      ],
      next_cursor: null,
    })),
    unreadCount: vi.fn(async () => ({ count: 1 })),
    markRead: vi.fn(async () => ({})),
    markAllRead: vi.fn(async () => ({ updated: 1 })),
    dismiss: vi.fn(async () => ({})),
  },
}));

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('NotificationDrawerContainer', () => {
  it('shows the item, marks all read on click', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onClose = vi.fn();
    render(<NotificationDrawerContainer open onClose={onClose} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Hi')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /mark all as read/i }));
    const { notificationsClient } = await import('../api/client');
    expect(notificationsClient.markAllRead).toHaveBeenCalled();
  });
});
