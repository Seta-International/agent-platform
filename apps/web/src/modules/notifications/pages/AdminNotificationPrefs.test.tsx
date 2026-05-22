import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminNotificationPrefs } from './AdminNotificationPrefs';

const listPrefs = vi.fn();
const setPref = vi.fn();

vi.mock('../api/client', () => ({
  notificationsClient: {
    listPrefs: () => listPrefs(),
    setPref: (input: unknown) => setPref(input),
  },
}));

function makeMatrix() {
  return {
    rows: Array.from({ length: 8 }, (_, i) => ({
      event_type: `planner.e${i}`,
      label: `Event ${i}`,
      in_app_enabled: true,
      email_enabled: false,
      email_available: false,
    })),
  };
}

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('AdminNotificationPrefs', () => {
  it('renders 8 rows × 2 toggles after loading', async () => {
    listPrefs.mockResolvedValueOnce(makeMatrix());
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AdminNotificationPrefs />, { wrapper: wrap(qc) });
    await waitFor(() => {
      expect(screen.getAllByRole('switch')).toHaveLength(16);
    });
  });

  it('clicking an in-app switch invokes setPref with the right payload', async () => {
    listPrefs.mockResolvedValueOnce(makeMatrix());
    setPref.mockResolvedValueOnce({ ok: true });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AdminNotificationPrefs />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getAllByRole('switch')).toHaveLength(16));
    const switches = screen.getAllByRole('switch');
    const firstInApp = switches[0];
    if (!firstInApp) throw new Error('missing switch');
    await userEvent.click(firstInApp);
    expect(setPref).toHaveBeenCalledWith({
      event_type: 'planner.e0',
      channel: 'in_app',
      enabled: false,
    });
  });

  it('shows an error alert when the query fails', async () => {
    listPrefs.mockRejectedValueOnce(new Error('boom'));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AdminNotificationPrefs />, { wrapper: wrap(qc) });
    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    });
  });
});
