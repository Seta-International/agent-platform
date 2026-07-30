import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RequisitionDetail } from '../../src/api/hiring-client.ts';
import { RequisitionDetailView } from '../../src/pages/requisition-detail-view.tsx';

const applyInternalRequisitionMock = vi.fn();

const DETAIL_NOT_APPLIED: RequisitionDetail = {
  requisition: {
    id: 'r1',
    title: 'Senior Engineer',
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
  applicants: [],
  has_applied: false,
  user_application_id: null,
};

const DETAIL_APPLIED: RequisitionDetail = {
  ...DETAIL_NOT_APPLIED,
  has_applied: true,
  user_application_id: 'app-user-1',
};

// A fully-staffed requisition: still `open`, but every opening is filled. FUT-769 keeps Mark filled
// live in this state (the recruiter's one-click close) while the other lifecycle actions stay frozen.
const DETAIL_FULLY_STAFFED: RequisitionDetail = {
  ...DETAIL_NOT_APPLIED,
  openings: [
    {
      id: 'op-1',
      requisition_id: 'r1',
      seq: 1,
      status: 'filled',
      close_reason_id: null,
      closed_at: null,
      hired_application_id: 'app-hired-1',
      version: 1,
    },
  ],
};

let currentDetail = DETAIL_NOT_APPLIED;

vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchRequisition: () => Promise.resolve(structuredClone(currentDetail)),
  fetchAccounts: () => Promise.resolve([]),
  fetchProjects: () => Promise.resolve([]),
  fetchSkillCatalog: () => Promise.resolve({ categories: [], skills: [] }),
  applyInternalRequisition: (reqId: string, note?: string) => {
    applyInternalRequisitionMock(reqId, note);
    return Promise.resolve({ candidate_id: 'cand-1', application_id: 'app-1' });
  },
}));

vi.mock('@seta/web-identity', () => ({
  usePermission: () => true,
}));

function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('RequisitionDetailView Apply button (FUT-650)', () => {
  it('renders Apply always disabled with a "Coming soon" tooltip and never applies', async () => {
    currentDetail = DETAIL_NOT_APPLIED;
    applyInternalRequisitionMock.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<RequisitionDetailView requisitionId="r1" variant="page" />, {
      wrapper: wrap(qc),
    });

    const applyBtn = await screen.findByRole('button', { name: 'Apply' });
    expect(applyBtn).toBeInTheDocument();
    expect(applyBtn).toBeDisabled();

    // The disabled reason is reachable on hover/focus via the wrapping tooltip.
    await userEvent.hover(applyBtn);
    expect(await screen.findByText('Coming soon')).toBeInTheDocument();

    // Applying is not wired up — the disabled control must never fire the mutation.
    await userEvent.click(applyBtn);
    expect(applyInternalRequisitionMock).not.toHaveBeenCalled();
  });

  it('renders disabled Applied button when has_applied is true', async () => {
    currentDetail = DETAIL_APPLIED;
    applyInternalRequisitionMock.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<RequisitionDetailView requisitionId="r1" variant="page" />, {
      wrapper: wrap(qc),
    });

    const appliedBtn = await screen.findByRole('button', { name: 'Applied' });
    expect(appliedBtn).toBeInTheDocument();
    expect(appliedBtn).toBeDisabled();
  });
});

describe('RequisitionDetailView fully-staffed actions (FUT-769)', () => {
  it('keeps Mark filled enabled while other lifecycle actions stay frozen when fully staffed', async () => {
    currentDetail = DETAIL_FULLY_STAFFED;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<RequisitionDetailView requisitionId="r1" variant="page" />, {
      wrapper: wrap(qc),
    });

    // Mark filled is the recruiter's one-click close for a fully-staffed req — it must stay live.
    const markFilledBtn = await screen.findByRole('button', { name: 'Mark filled' });
    expect(markFilledBtn).toBeEnabled();

    // The other lifecycle actions remain frozen by isFullyStaffed.
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeDisabled();
  });
});
