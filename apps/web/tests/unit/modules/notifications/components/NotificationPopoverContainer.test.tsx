import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationPopoverContainer } from '../../../../../src/modules/notifications/components/NotificationPopoverContainer';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return { ...actual, useLocation: vi.fn(() => ({ pathname: '/' })) };
});

vi.mock('../../../../../src/modules/notifications/api/client', () => ({
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

describe('NotificationPopoverContainer', () => {
  it('shows the item and marks all read after opening the popover', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NotificationPopoverContainer />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
    await waitFor(() => expect(screen.getByText('Hi')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    const { notificationsClient } = await import(
      '../../../../../src/modules/notifications/api/client'
    );
    expect(notificationsClient.markAllRead).toHaveBeenCalled();
  });
});
