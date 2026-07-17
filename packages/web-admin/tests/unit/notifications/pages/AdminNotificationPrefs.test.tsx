import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminNotificationPrefs } from '../../../../src/notifications/pages/AdminNotificationPrefs';

const listPrefs = vi.fn();
const setPref = vi.fn();

vi.mock('@seta/web-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@seta/web-notifications')>()),
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
      expect(screen.getByText(/Couldn.t load notification settings/)).toBeInTheDocument();
    });
  });

  it('renders the Admin → Notifications breadcrumb trail with a navigable root crumb', async () => {
    listPrefs.mockResolvedValueOnce(makeMatrix());
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<AdminNotificationPrefs />, { wrapper: wrap(qc) });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Admin' });
    expect(rootCrumb).toHaveAttribute('href', '/admin');
    // Per the app manifest + the plan's derivation footnote, the current crumb
    // follows the manifest nav label ("Notifications"), which now matches the
    // page's own h1 text — scoped to `nav` so this doesn't also match the h1.
    expect(within(nav).getByText('Notifications').closest('a')).toBeNull();

    // The h1 still carries the page's real heading semantics (queried outside
    // `nav`, so it can't accidentally match the crumb span sharing the same text).
    expect(screen.getByRole('heading', { level: 1, name: 'Notifications' })).toBeInTheDocument();
  });
});
