import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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
  it('clears entered data when reopened after Cancel', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    await userEvent.type(screen.getByLabelText(/job title/i), 'Stale Title');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    expect(screen.getByLabelText(/job title/i)).toHaveValue('');
  });

  it('shows inline validation errors and highlights invalid fields on submit failure, then scrolls to first invalid field', async () => {
    const scrollMock = vi.fn();
    Element.prototype.scrollIntoView = scrollMock;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    // Open dialog
    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));

    // Click submit
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    // Check inline validation messages
    expect(screen.getByText('Job title is required.')).toBeInTheDocument();
    expect(screen.getByText('About the role is required.')).toBeInTheDocument();

    // Check highlight classes
    expect(screen.getByLabelText(/job title/i)).toHaveClass('border-danger');

    // Should have scrolled to the first invalid field (Job Title)
    expect(scrollMock).toHaveBeenCalledTimes(1);
  });
});
