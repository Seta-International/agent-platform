import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
    dob: null,
    gender: null,
    note: 'Strong fundamentals',
    contact: { email: 'ada@example.com', phone: '+1' },
    version: 1,
  },
  application: {
    application_id: 'a1',
    requisition_id: 'r1',
    requisition_title: 'Backend Eng',
    account_id: null,
    stage: 'screening',
    status: 'active',
    rating: 3,
    tags: [],
    version: 4,
    fit: { met: 2, required: 3, score: 0.66, strong: false },
  },
  skills: [{ skill_id: 's1', skill_name: 'TypeScript', level: 4 }],
  timeline: [
    {
      id: 'e1',
      kind: 'created',
      summary: 'Candidate created',
      created_at: '2026-06-20T10:00:00Z',
      actor_user_id: null,
    },
  ],
};

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('CandidateDetailDrawer', () => {
  it('shows profile, skills, fit, and the activity timeline', async () => {
    fetchCandidate.mockResolvedValue(detail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('2/3 skills')).toBeInTheDocument();
    expect(screen.getByText('Candidate created')).toBeInTheDocument();
    expect(screen.getByText(/No interviews yet/i)).toBeInTheDocument();
  });

  it('moves stage when a pipeline-stage button is clicked', async () => {
    fetchCandidate.mockResolvedValue(detail);
    moveApplicationStage.mockResolvedValueOnce({ version: 5 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Interview' }));
    await waitFor(() =>
      expect(moveApplicationStage).toHaveBeenCalledWith('a1', {
        expected_version: 4,
        to: 'interview',
      }),
    );
  });
});
