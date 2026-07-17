import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const addCandidate = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  addCandidate: (input: unknown) => addCandidate(input),
  fetchRequisitions: () => Promise.resolve([{ id: 'r1', title: 'Backend Eng', status: 'open' }]),
  fetchSkillCatalog: () =>
    Promise.resolve({
      categories: [{ id: 'cat1', name: 'Backend', sort_order: 0, active: true }],
      skills: [{ id: 's1', name: 'TypeScript', category_id: 'cat1', active: true }],
    }),
}));

import { NewCandidateDialog } from '../../src/pages/new-candidate-dialog.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('NewCandidateDialog', () => {
  it('asks before discarding entered data, then clears it when confirmed', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.getByText('Discard this candidate?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^discard$/i }));

    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    expect(screen.getByLabelText(/full name/i)).toHaveValue('');
  });

  it('keeps the form when choosing Keep editing', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Keep me');
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep editing/i }));

    expect(screen.getByLabelText(/full name/i)).toHaveValue('Keep me');
  });

  it('closes without confirmation when nothing was entered', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByText('Discard this candidate?')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();
  });

  it('focuses the invalid email instead of failing silently', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });

    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    await userEvent.type(screen.getByLabelText(/^email$/i), 'not-an-email');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /position applied/i })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: /save candidate/i }));

    expect(addCandidate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^email$/i)).toHaveFocus();
  });

  it('submits addCandidate with the entered name and selected role', async () => {
    addCandidate.mockResolvedValueOnce({ candidate_id: 'c1', application_id: 'a1' });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await userEvent.type(screen.getByLabelText(/full name/i), 'Ada Lovelace');
    // Wait for requisitions query to load so effectiveReq resolves to r1 (Backend Eng)
    await waitFor(() =>
      expect(qc.getQueryState(['hiring', 'requisition-options'])?.status).toBe('success'),
    );
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /position applied/i })).toBeInTheDocument(),
    );
    // effectiveReq auto-selects r1 (Backend Eng, the only open req)
    await userEvent.click(screen.getByRole('button', { name: /save candidate/i }));
    await waitFor(() =>
      expect(addCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ada Lovelace', requisition_id: 'r1' }),
      ),
    );
  });

  it('does not crash when the requisitions-board query already cached an object under the shared key (FUT-335)', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Simulates having visited the Requisitions board first: requisitions-page.tsx caches an
    // `OpenRequisitionsBoard` object (not an array) under the same ['hiring','requisitions'] key
    // that fetchRequisitions() (a plain array) also used before this fix.
    qc.setQueryData(['hiring', 'requisitions'], {
      scope: 'all',
      scoped_account_names: [],
      scoped_project_names: [],
      requisitions: [],
    });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /position applied/i })).toBeInTheDocument(),
    );
  });
});
