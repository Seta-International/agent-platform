import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@seta/web-identity', () => ({ usePermission: () => true }));

vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchJdTemplates: () => Promise.resolve([]),
  fetchCloseReasons: () => Promise.resolve([]),
  fetchRejectionReasons: () => Promise.resolve([]),
  createJdTemplate: vi.fn(),
  createCloseReason: vi.fn(),
  createRejectionReason: vi.fn(),
}));

import { SettingsPage } from '../../src/pages/settings-page.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

// Astryx's real Dialog always mounts <dialog> + children regardless of `isOpen`. purpose="form"
// renders role="dialog" only once open; DialogHeader doesn't wire aria-labelledby, so assert the
// title via its heading rather than the dialog's accessible name — matching this batch's
// established pattern (see NewRequisitionDialog's test).
describe('SettingsPage', () => {
  it('renders the breadcrumb trail and page heading', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<SettingsPage />, { wrapper: wrap(qc) });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Hiring Management' });
    expect(rootCrumb).toHaveAttribute('href', '/hiring');
    expect(within(nav).getByText('Hiring settings').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Hiring settings' })).toBeInTheDocument();

    expect(within(nav).queryByRole('link', { name: 'Requisitions' })).not.toBeInTheDocument();
  });

  it('has no dialog exposed until a trigger is clicked', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<SettingsPage />, { wrapper: wrap(qc) });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the New JD template dialog with its create-form heading', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<SettingsPage />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: 'New template' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New JD template' })).toBeInTheDocument();
  });

  it('opens the New close reason dialog with its create-form heading', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<SettingsPage />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: 'New close reason' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New close reason' })).toBeInTheDocument();
  });

  it('opens the New rejection reason dialog with its create-form heading', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<SettingsPage />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: 'New rejection reason' }));

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'New rejection reason' }),
    ).toBeInTheDocument();
  });

  it('clears entered data when the New JD template dialog is reopened after Cancel', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<SettingsPage />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: 'New template' }));
    await userEvent.type(screen.getByLabelText(/name/i), 'Stale Name');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New template' }));
    expect(screen.getByLabelText(/name/i)).toHaveValue('');
  });
});
