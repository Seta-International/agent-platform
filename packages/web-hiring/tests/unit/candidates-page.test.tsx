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
  fetchCandidateStageCounts: () =>
    Promise.resolve({ new: 1, screening: 0, interview: 0, offer: 0, hired: 0, cancelled: 0 }),
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
    applied_at: '2024-01-01T00:00:00.000Z',
    skills: [],
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
    // "New"/"Screening"/"Hired" each appear twice (stat segment label + board column name).
    expect(screen.getAllByText('New').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Screening').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Interview').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Offer').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Hired').length).toBeGreaterThanOrEqual(2);
  });

  it('search narrows by skill name (FUT-333)', async () => {
    fetchCandidates.mockResolvedValue([
      rows[0],
      {
        ...rows[0],
        application_id: 'a2',
        candidate_id: 'c2',
        name: 'Grace Hopper',
        skills: [{ skill_id: 's1', skill_name: 'Terraform', level: 3 }],
      },
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Grace Hopper')).toBeInTheDocument());
    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'terraform');
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('switches to list view', async () => {
    fetchCandidates.mockResolvedValue(rows);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: 'List' }));
    expect(screen.getByRole('columnheader', { name: 'Seniority' })).toBeInTheDocument();
  });
});
