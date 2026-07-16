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

  it('shows inline validation errors and highlights invalid fields on submit failure, then scrolls to first invalid field', async () => {
    const scrollMock = vi.fn();
    Element.prototype.scrollIntoView = scrollMock;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<NewCandidateDialog />, { wrapper: wrap(qc) });

    // Open dialog
    await userEvent.click(screen.getByRole('button', { name: /new candidate/i }));

    // Submit form (Full name is empty, requisition has default r1 so not empty)
    await userEvent.click(screen.getByRole('button', { name: /save candidate/i }));

    // Check inline validation messages
    expect(screen.getByText('Full name is required.')).toBeInTheDocument();

    // Check highlight classes
    expect(screen.getByLabelText(/full name/i)).toHaveClass('border-danger');

    // Should have scrolled to the first invalid field (Full name)
    expect(scrollMock).toHaveBeenCalledTimes(1);
  });
});
