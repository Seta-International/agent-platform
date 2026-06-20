import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateListItem } from '../../src/api/hiring-client.ts';

vi.mock('@seta/web-identity', () => ({ usePermission: () => true }));

const fetchCandidates = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchCandidates: () => fetchCandidates(),
  fetchRequisitions: () => Promise.resolve([{ id: 'r1', title: 'Backend Eng', status: 'open' }]),
}));

import { CandidatesPage } from '../../src/pages/candidates-page.tsx';

const rows: CandidateListItem[] = [
  {
    application_id: 'a1',
    candidate_id: 'c1',
    name: 'Ada Lovelace',
    seniority: 'Senior',
    source: 'Referral',
    requisition_id: 'r1',
    requisition_title: 'Backend Eng',
    stage: 'new',
    status: 'active',
    rating: 0,
    version: 1,
    fit: { met: 1, required: 2, score: 0.5, strong: false },
  },
];

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('CandidatesPage', () => {
  it('renders the board with the candidate card under New', async () => {
    fetchCandidates.mockResolvedValue(rows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getAllByText('Hired').length).toBeGreaterThanOrEqual(2);
  });

  it('switches to list view', async () => {
    fetchCandidates.mockResolvedValue(rows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(screen.getByText('Seniority')).toBeInTheDocument();
  });
});
