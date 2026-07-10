import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateDetail } from '../../src/api/hiring-client.ts';

const fetchCandidate = vi.fn();
const moveApplicationStage = vi.fn();
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchCandidate: (id: string) => fetchCandidate(id),
  moveApplicationStage: (id: string, input: unknown) => moveApplicationStage(id, input),
  // The drawer mounts RejectDialog and TransferDialog, whose queries are not gated on
  // `open`. Left unmocked they reach the real client and open a socket to the dev server.
  fetchRejectionReasons: () => Promise.resolve([]),
  fetchRequisitions: () => Promise.resolve([]),
}));

vi.mock('@seta/web-identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@seta/web-identity')>()),
  usePermission: () => true,
}));

import { CandidateDetailDrawer } from '../../src/pages/candidate-detail-drawer.tsx';

const detail: CandidateDetail = {
  candidate: {
    id: 'c1',
    name: 'Ada Lovelace',
    source: 'Referral',
    seniority: 'Senior',
    segment: null,
    dob: '1998-05-12',
    gender: 'female',
    cv_storage_key: 'cv/ada-lovelace.pdf',
    contact: { email: 'ada@example.com', phone: '+1' },
    version: 1,
  },
  applications: [
    {
      application_id: 'a1',
      requisition_id: 'r1',
      requisition_title: 'Backend Eng',
      account_id: null,
      stage: 'screening',
      status: 'active',
      rating: 3,
      tags: [],
      version: 4,
      applied_at: '2026-06-18T10:00:00Z',
      note: 'Strong fundamentals',
      fit: { met: 2, required: 3, score: 0.66, strong: false },
    },
  ],
  skills: [{ skill_id: 's1', skill_name: 'TypeScript', level: 4 }],
  timeline: [
    {
      id: 'e1',
      kind: 'created',
      summary: 'Candidate created',
      created_at: '2026-06-20T10:00:00Z',
      actor_user_id: null,
    },
    {
      id: 'e2',
      kind: 'stage_changed',
      summary: 'Moved to Screening',
      created_at: '2026-06-21T10:00:00Z',
      actor_user_id: 'u1',
    },
  ],
};

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('CandidateDetailDrawer', () => {
  it('shows profile, skills, fit, note, and the activity timeline', async () => {
    fetchCandidate.mockResolvedValue(detail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('2/3 skills')).toBeInTheDocument();
    expect(screen.getByText('Candidate created')).toBeInTheDocument();
    expect(screen.getByText('1998-05-12')).toBeInTheDocument();
    expect(screen.getByText('female')).toBeInTheDocument();
    expect(screen.getByText('Strong fundamentals')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
    // A null actor is reliably a system event; a real actor id has no name projection in
    // this module, so it is labeled honestly rather than guessed.
    expect(screen.getByText(/by System/)).toBeInTheDocument();
    expect(screen.getByText(/by No Data/)).toBeInTheDocument();
  });

  it('moves stage from the Move stage menu', async () => {
    fetchCandidate.mockResolvedValue(detail);
    moveApplicationStage.mockResolvedValueOnce({ version: 5 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /Move stage/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Interview' }));
    await waitFor(() =>
      expect(moveApplicationStage).toHaveBeenCalledWith('a1', {
        expected_version: 4,
        to: 'interview',
      }),
    );
  });
});
