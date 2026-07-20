import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const fetchCandidate = vi.fn();

const DETAIL = {
  requisition: {
    id: 'r1',
    title: 'Role A',
    role_title: null,
    grade: null,
    account_id: null,
    project_id: null,
    kind: 'new',
    approval_status: 'approved',
    status: 'open',
    stage: 'sourcing',
    owner_user_id: null,
    due_date: null,
    start_date: null,
    note: null,
    default_interview_mode: 'online',
    closed_at: null,
    created_at: '2026-07-01T00:00:00Z',
    version: 1,
  },
  account_name: null,
  project_name: null,
  openings: [],
  jd_sections: [],
  skills: [],
  applicants: [
    {
      id: 'app-1',
      requisition_id: 'r1',
      kind: 'external',
      candidate_id: 'cand-1',
      worker_id: null,
      stage: 'screening',
      status: 'active',
      candidate_name: 'Nguyen Van An',
      candidate_seniority: 'senior',
      created_at: '2026-07-10T00:00:00Z',
    },
    {
      id: 'app-2',
      requisition_id: 'r1',
      kind: 'external',
      candidate_id: 'cand-2',
      worker_id: null,
      stage: 'screening',
      status: 'transferred',
      candidate_name: 'Tran Thi Binh',
      candidate_seniority: 'middle',
      created_at: '2026-07-09T00:00:00Z',
    },
  ],
};

vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchRequisition: () => Promise.resolve(structuredClone(DETAIL)),
  fetchAccounts: () => Promise.resolve([]),
  fetchProjects: () => Promise.resolve([]),
  fetchSkillCatalog: () => Promise.resolve({ categories: [], skills: [] }),
  fetchCandidate: (id: string) => {
    fetchCandidate(id);
    return new Promise(() => {}); // keep the drawer in its loading state
  },
}));

vi.mock('@seta/web-identity', () => ({ usePermission: () => true }));

import { RequisitionDetailView } from '../../src/pages/requisition-detail-view.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe('RequisitionDetailView applicants list', () => {
  it('renders applicants from the detail read (no board cache needed) and opens the candidate drawer on click', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<RequisitionDetailView requisitionId="r1" variant="page" />, { wrapper: wrap(qc) });

    // Active applicant renders even without the requisitions-board cache warm (direct link).
    const row = await screen.findByRole('button', { name: /nguyen van an/i });
    await userEvent.click(row);

    expect(fetchCandidate).toHaveBeenCalledWith('cand-1');
  });

  it('opens the drawer from a past applicant too', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<RequisitionDetailView requisitionId="r1" variant="page" />, { wrapper: wrap(qc) });

    const row = await screen.findByRole('button', { name: /tran thi binh/i });
    await userEvent.click(row);

    expect(fetchCandidate).toHaveBeenCalledWith('cand-2');
  });
});
