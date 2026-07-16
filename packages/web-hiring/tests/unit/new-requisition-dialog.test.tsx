import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchAccounts: () => Promise.resolve([]),
  fetchProjects: () => Promise.resolve([]),
  openRequisition: vi.fn(),
}));

// TipTap doesn't fully initialize under jsdom; a plain textarea keeps the form behavior testable.
vi.mock('@seta/shared-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@seta/shared-ui')>();
  return {
    ...actual,
    RichTextEditor: ({
      value,
      onChange,
      placeholder,
    }: {
      value: string;
      onChange: (html: string) => void;
      placeholder?: string;
    }) => (
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    ),
  };
});

import { NewRequisitionDialog } from '../../src/pages/new-requisition-dialog.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('NewRequisitionDialog', () => {
  // Astryx's real Dialog always mounts <dialog> + children regardless of `isOpen`. purpose="form"
  // renders role="dialog" only once open; DialogHeader doesn't wire aria-labelledby, so assert the
  // title via its heading rather than the dialog's accessible name — matching this batch's
  // established pattern.
  it('is not exposed as a dialog until the trigger is clicked, then opens with the create-form heading', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'New requisition' })).toBeInTheDocument();
  });

  it('clears entered data when reopened after Cancel', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    await userEvent.type(screen.getByLabelText(/job title/i), 'Stale Title');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    expect(screen.getByLabelText(/job title/i)).toHaveValue('');
  });
});
