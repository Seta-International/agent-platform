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
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Backend Eng' })).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByRole('button', { name: /save candidate/i }));
    await waitFor(() =>
      expect(addCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Ada Lovelace', requisition_id: 'r1' }),
      ),
    );
  });
});
