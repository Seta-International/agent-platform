import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

  // FUT-788: Dialog DOM stays mounted between open/close cycles (Astryx behaviour), so the
  // LayoutContent scroll container would retain its previous scrollTop. Verify that scrollTo is
  // called with { top: 0 } each time the dialog reopens.
  it('resets scroll to top each time the dialog is reopened (FUT-788)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    // Open once then close (pristine form closes without confirmation).
    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // jsdom treats scrollTo as a no-op but records calls when spied upon.
    const scrollToSpy = vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(() => {});

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0 });
    scrollToSpy.mockRestore();
  });

  it('clears entered data when reopened after Cancel', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    await userEvent.type(screen.getByLabelText(/job title/i), 'Stale Title');
    await userEvent.type(screen.getByPlaceholderText(/write the about section/i), 'Stale About');
    await userEvent.type(
      screen.getByPlaceholderText(/write the responsibilities/i),
      'Stale Responsibilities',
    );
    await userEvent.type(
      screen.getByPlaceholderText(/write the requirements/i),
      'Stale Requirements',
    );
    await userEvent.type(
      screen.getByPlaceholderText(/write the nice to have/i),
      'Stale Nice to have',
    );

    // Dirty form -> Cancel prompts to confirm; Discard actually closes it.
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    expect(screen.getByLabelText(/job title/i)).toHaveValue('');
    expect(screen.getByPlaceholderText(/write the about section/i)).toHaveValue('');
    expect(screen.getByPlaceholderText(/write the responsibilities/i)).toHaveValue('');
    expect(screen.getByPlaceholderText(/write the requirements/i)).toHaveValue('');
    expect(screen.getByPlaceholderText(/write the nice to have/i)).toHaveValue('');
  });

  // Cancel must mirror the close (X) button: with unsaved input it opens the discard confirmation
  // (an alertdialog) rather than dropping the form silently.
  it('opens the discard confirmation when Cancel is clicked with unsaved input', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    await userEvent.type(screen.getByLabelText(/job title/i), 'Stale Title');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    const confirm = await screen.findByRole('alertdialog');
    expect(within(confirm).getByText('Discard this requisition?')).toBeInTheDocument();
  });

  // The confirmation is only for unsaved work -- an untouched form closes on Cancel with no prompt.
  it('closes without confirmation when Cancel is clicked on a pristine form', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('validates headcount bounds and prevents submission when invalid', async () => {
    const { openRequisition } = await import('../../src/api/hiring-client.ts');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));

    await userEvent.type(screen.getByLabelText(/job title/i), 'Software Engineer');
    await userEvent.type(screen.getByPlaceholderText(/write the about section/i), 'Role details');

    const headcountInput = screen.getByRole('spinbutton', { name: /headcount/i });
    await userEvent.clear(headcountInput);

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(screen.getByText('Headcount must be a positive whole number.')).toBeInTheDocument();
    expect(openRequisition).not.toHaveBeenCalled();
  });

  it('submits requisition when all required fields and headcount are valid', async () => {
    const { openRequisition } = await import('../../src/api/hiring-client.ts');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));

    await userEvent.type(screen.getByLabelText(/job title/i), 'Senior Dev');
    await userEvent.type(screen.getByPlaceholderText(/write the about section/i), 'Role details');

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(openRequisition).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Senior Dev',
        headcount: 1,
      }),
    );
  });

  it('validates job title max length (100 chars) and shows inline error message (FUT-789)', async () => {
    const { openRequisition } = await import('../../src/api/hiring-client.ts');
    vi.mocked(openRequisition).mockReset();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewRequisitionDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new requisition/i }));

    const titleInput = screen.getByLabelText(/job title/i);
    await userEvent.type(screen.getByPlaceholderText(/write the about section/i), 'Role details');

    // Fire change directly with a 105 character string (bypassing native keyboard input limit)
    const longTitle = 'A'.repeat(105);
    await userEvent.clear(titleInput);
    fireEvent.change(titleInput, { target: { value: longTitle } });

    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(screen.getByText('Job title cannot exceed 100 characters.')).toBeInTheDocument();
    expect(openRequisition).not.toHaveBeenCalled();
  });
});
