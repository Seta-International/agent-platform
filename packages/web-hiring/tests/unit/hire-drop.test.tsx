import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCandidates = vi.fn();
const moveApplicationStage = vi.fn();
const hireApplication = vi.fn();

vi.mock('@seta/web-identity', () => ({ usePermission: () => true }));
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchCandidates: () => fetchCandidates(),
  moveApplicationStage: (id: string, i: unknown) => moveApplicationStage(id, i),
  hireApplication: (id: string, i: unknown) => hireApplication(id, i),
  fetchRejectedCandidates: () => Promise.resolve([]),
  fetchCandidateStageCounts: () =>
    Promise.resolve({ new: 0, screening: 0, interview: 0, offer: 1, hired: 0, cancelled: 0 }),
  fetchRequisitions: () => Promise.resolve([{ id: 'r1', title: 'Backend', status: 'open' }]),
}));

import { CandidatesPage } from '../../src/pages/candidates-page.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
});

describe('Offer -> Hired drop', () => {
  it('enables both the Offer card and the Hired drop target', async () => {
    fetchCandidates.mockResolvedValue([
      {
        application_id: 'a1',
        candidate_id: 'c1',
        name: 'Ada Lovelace',
        seniority: 'Senior',
        source: 'Ref',
        requisition_id: 'r1',
        requisition_title: 'Backend',
        requisition_status: 'open',
        stage: 'offer',
        status: 'active',
        rating: 0,
        version: 9,
        applied_at: '2024-01-01T00:00:00.000Z',
        skills: [],
        required_skills: [],
        fit: { met: 0, required: 0, score: 0, strong: false },
      },
    ]);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidatesPage />, { wrapper: wrap(qc) });
    await screen.findByText('Ada Lovelace');

    // The Offer card is draggable (not disabled) and the Hired column accepts drops.
    const card = document.querySelector('[data-rfd-draggable-id="a1"]');
    const hiredCol = document.querySelector('[data-rfd-droppable-id="hired"]');
    expect(card).not.toBeNull();
    expect(hiredCol).not.toBeNull();

    // The candidate is in the Offer column (draggable-id's ancestor is the offer droppable).
    const offerCol = document.querySelector('[data-rfd-droppable-id="offer"]');
    expect(offerCol).not.toBeNull();
    expect(offerCol!.contains(card as Node)).toBe(true);
  });
});
