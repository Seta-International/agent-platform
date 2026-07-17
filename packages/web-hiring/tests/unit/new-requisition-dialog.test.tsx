import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { openRequisition } from '../../src/api/hiring-client.ts';
import { NewRequisitionDialog } from '../../src/pages/new-requisition-dialog.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

async function openWithRequiredFields() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<NewRequisitionDialog />, { wrapper: wrap(qc) });
  await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
  await userEvent.type(screen.getByLabelText(/job title/i), 'Senior Backend Engineer');
  await userEvent.type(screen.getByPlaceholderText(/write the about section/i), 'About text');
}

describe('NewRequisitionDialog', () => {
  beforeEach(() => vi.mocked(openRequisition).mockReset());

  it('asks before discarding entered data, then clears it when confirmed', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    await userEvent.type(screen.getByLabelText(/job title/i), 'Stale Title');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.getByText('Discard this requisition?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }));

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    expect(screen.getByLabelText(/job title/i)).toHaveValue('');
  });

  it('keeps the form when choosing Keep editing', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    await userEvent.type(screen.getByLabelText(/job title/i), 'Keep me');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep editing/i }));

    expect(screen.getByLabelText(/job title/i)).toHaveValue('Keep me');
  });

  it('closes without confirmation when nothing was entered', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByText('Discard this requisition?')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/job title/i)).not.toBeInTheDocument();
  });

  it('rejects a start date in the past', async () => {
    await openWithRequiredFields();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2000-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(screen.getByText('Start date cannot be in the past.')).toBeInTheDocument();
    expect(openRequisition).not.toHaveBeenCalled();
  });

  it('rejects a due date before the start date', async () => {
    await openWithRequiredFields();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2999-01-02' } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2999-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(screen.getByText('Due date must be on or after the start date.')).toBeInTheDocument();
    expect(openRequisition).not.toHaveBeenCalled();
  });

  it('accepts a due date equal to the start date', async () => {
    vi.mocked(openRequisition).mockResolvedValue({ requisition_id: 'r1' } as never);
    await openWithRequiredFields();
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2999-01-02' } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2999-01-02' } });
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(openRequisition).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: '2999-01-02', due_date: '2999-01-02' }),
    );
  });
});
