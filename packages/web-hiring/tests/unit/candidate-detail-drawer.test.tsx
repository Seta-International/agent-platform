import { ToastViewport } from '@seta/shared-ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateDetail } from '../../src/api/hiring-client.ts';

const fetchCandidate = vi.fn();
const fetchRequisition = vi.fn();
const moveApplicationStage = vi.fn();
const editCandidate = vi.fn();
const requestCandidateCvUpload = vi.fn();
const putCvToS3 = vi.fn();
const getCandidateCvDownloadUrl = vi.fn();
const hireApplication = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchRequisition.mockResolvedValue({
    id: 'r1',
    title: 'Backend Eng',
    skills: [
      { skill_id: 's1', skill_name: 'TypeScript' },
      { skill_id: 's2', skill_name: 'React' },
      { skill_id: 's3', skill_name: 'Node.js' },
    ],
  });
});
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchCandidate: (id: string) => fetchCandidate(id),
  fetchRequisition: (id: string) => fetchRequisition(id),
  moveApplicationStage: (id: string, input: unknown) => moveApplicationStage(id, input),
  editCandidate: (...args: unknown[]) => editCandidate(...args),
  requestCandidateCvUpload: (...args: unknown[]) => requestCandidateCvUpload(...args),
  putCvToS3: (url: string, file: File) => putCvToS3(url, file),
  getCandidateCvDownloadUrl: (id: string) => getCandidateCvDownloadUrl(id),
  hireApplication: (id: string, input: unknown) => hireApplication(id, input),
}));

// The timeline resolves actor_user_ids to names via the identity directory.
vi.mock('../../src/api/identity-directory.ts', () => ({
  fetchDirectoryUsersByIds: (ids: string[]) =>
    Promise.resolve(
      ids.includes('u-1')
        ? [{ user_id: 'u-1', email: 'jane@example.com', name: 'Jane Recruiter' }]
        : [],
    ),
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
    contact: { personal_email: 'ada@example.com', phone: '+1' },
    version: 1,
  },
  applications: [
    {
      application_id: 'a1',
      requisition_id: 'r1',
      requisition_title: 'Backend Eng',
      requisition_status: 'open',
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
      // A real actor id — resolved to a display name via the identity directory.
      id: 'e2',
      kind: 'stage_changed',
      summary: 'Moved to screening',
      created_at: '2026-06-21T10:00:00Z',
      actor_user_id: 'u-1',
    },
  ],
};

// ToastViewport is mounted explicitly so useToast resolves through context rather than
// self-mounting a fallback viewport, which warns and cannot be cleaned up between tests.
const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastViewport>{children}</ToastViewport>
    </QueryClientProvider>
  );

describe('CandidateDetailDrawer', () => {
  // No `DialogHeader` is rendered here (special case — the drawer's own content renders its own
  // visible header), so the dialog's accessible name comes directly from a dynamic `aria-label`
  // ("Candidate: {name}") rather than a heading. Astryx's real Dialog always mounts <dialog> +
  // children regardless of `isOpen`; `candidateId={null}` maps to `isOpen={false}`.
  it('is not exposed as a dialog when candidateId is null, then opens labeled with the candidate name once loaded', async () => {
    fetchCandidate.mockResolvedValue(detail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(<CandidateDetailDrawer candidateId={null} onClose={() => {}} />, {
      wrapper: wrap(qc),
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Candidate: Ada Lovelace' })).toBeInTheDocument(),
    );
  });

  it('shows profile, fit, note, and the activity timeline', async () => {
    fetchCandidate.mockResolvedValue(detail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    // Skills live in the CV now — the drawer surfaces the fit summary, not a chip list.
    await waitFor(() => expect(screen.getByText(/2 of 3/)).toBeInTheDocument());
    expect(screen.getByText('Candidate created')).toBeInTheDocument();
    expect(screen.getByText('1998-05-12')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Strong fundamentals')).toBeInTheDocument();
    expect(screen.getByText('3/5')).toBeInTheDocument();
    // A null actor is a system event; a real actor id resolves to its directory name. The
    // label shares a text node with the timestamp ("by System · 20 Jun 2026"), so match on a
    // substring.
    expect(screen.getByText(/by System ·/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/by Jane Recruiter ·/)).toBeInTheDocument());
  });

  it('shows CV file card when cv_storage_key exists', async () => {
    fetchCandidate.mockResolvedValue(detail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('ada-lovelace.pdf')).toBeInTheDocument());
    expect(screen.getByText('Replace')).toBeInTheDocument();
  });

  it('downloads CV when file card is clicked', async () => {
    const dlUrl = 'https://s3.example/dl/cv.pdf';
    getCandidateCvDownloadUrl.mockResolvedValue(dlUrl);
    window.open = vi.fn();
    fetchCandidate.mockResolvedValue(detail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('ada-lovelace.pdf')).toBeInTheDocument());
    await userEvent.click(screen.getByText('ada-lovelace.pdf'));
    expect(getCandidateCvDownloadUrl).toHaveBeenCalledWith('c1');
    expect(window.open).toHaveBeenCalledWith(dlUrl, '_blank', 'noopener');
  });

  it('replaces CV via presigned upload flow when canManage', async () => {
    requestCandidateCvUpload.mockResolvedValue({
      upload_url: 'https://s3.example/put/cv.pdf',
      s3_key: 'cv/new.pdf',
    });
    putCvToS3.mockResolvedValue(undefined);
    editCandidate.mockResolvedValue({});
    fetchCandidate.mockResolvedValue(detail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Replace')).toBeInTheDocument());

    const file = new File(['pdf-content'], 'resume.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('Replace') as HTMLInputElement;
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(requestCandidateCvUpload).toHaveBeenCalledWith('c1', 'resume.pdf', 'application/pdf');
      expect(putCvToS3).toHaveBeenCalledWith('https://s3.example/put/cv.pdf', file);
      expect(editCandidate).toHaveBeenCalledWith('c1', { patch: { cv_storage_key: 'cv/new.pdf' } });
    });
  });

  it('rejects oversized CV file', async () => {
    fetchCandidate.mockResolvedValue(detail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Replace')).toBeInTheDocument());

    const big = new File(['x'.repeat(11 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('Replace') as HTMLInputElement;
    await userEvent.upload(input, big);

    // Scoped to the viewport: Astryx also mirrors the message into a body-level
    // assertive live region, which carries role="alert" too.
    const viewport = screen.getByRole('region', { name: 'Notifications' });
    expect(await within(viewport).findByRole('alert')).toHaveTextContent('CV must be under 10MB');
  });

  it('shows a CV upload dropzone when cv_storage_key is null', async () => {
    fetchCandidate.mockResolvedValue({
      ...detail,
      candidate: { ...detail.candidate, cv_storage_key: null },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByText('Upload a CV')).toBeInTheDocument();
    expect(screen.getByText(/PDF or DOCX/)).toBeInTheDocument();
  });

  it('advances the candidate to the next stage from the decision bar', async () => {
    fetchCandidate.mockResolvedValue(detail);
    moveApplicationStage.mockResolvedValueOnce({ version: 5 });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    // Candidate is in Screening, so the primary action advances to Interview — after a confirm.
    await userEvent.click(screen.getByRole('button', { name: /Advance to Interview/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Advance' }));
    await waitFor(() =>
      expect(moveApplicationStage).toHaveBeenCalledWith('a1', {
        expected_version: 4,
        to: 'interview',
      }),
    );
  });

  it('renders Hire button when application stage is offer and handles hiring success', async () => {
    const offerDetail: CandidateDetail = {
      ...detail,
      applications: [{ ...detail.applications[0]!, stage: 'offer' }],
    };
    fetchCandidate.mockResolvedValue(offerDetail);
    hireApplication.mockResolvedValueOnce({ version: 5 });
    const onClose = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={onClose} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    // Click Hire button to open confirmation dialog
    await userEvent.click(screen.getByRole('button', { name: 'Mark as hired' }));
    expect(screen.getByText('Hire Candidate')).toBeInTheDocument();

    // Click Confirm button inside confirmation dialog
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(hireApplication).toHaveBeenCalledWith('a1', { expected_version: 4 });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('displays exact error toast (e.g. no vacant openings) and closes drawer when hire fails', async () => {
    const offerDetail: CandidateDetail = {
      ...detail,
      applications: [{ ...detail.applications[0]!, stage: 'offer' }],
    };
    fetchCandidate.mockResolvedValue(offerDetail);
    const err = new Error('no vacant openings for this requisition') as Error & { status?: number };
    err.status = 409;
    hireApplication.mockRejectedValueOnce(err);
    const onClose = vi.fn();

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={onClose} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Mark as hired' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    // Should display exact error message in toast, NOT "This record changed — refreshing."
    const viewport = screen.getByRole('region', { name: 'Notifications' });
    expect(await within(viewport).findByRole('alert')).toHaveTextContent(
      'No vacant openings for this requisition',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('selects latest application when no application is active (FUT-902)', async () => {
    const multiAppDetail: CandidateDetail = {
      ...detail,
      applications: [
        {
          application_id: 'a1',
          requisition_id: 'r1',
          requisition_title: 'QA Manual Test New Ui',
          requisition_status: 'open',
          account_id: null,
          stage: 'new',
          status: 'transferred',
          rating: null,
          tags: [],
          version: 1,
          applied_at: '2026-07-22T10:00:00Z',
          note: null,
          fit: { met: 0, required: 0, score: 0, strong: false },
        },
        {
          application_id: 'a2',
          requisition_id: 'r2',
          requisition_title: 'Mobile Developer',
          requisition_status: 'open',
          account_id: null,
          stage: 'screening',
          status: 'cancelled',
          rating: null,
          tags: [],
          version: 2,
          applied_at: '2026-07-30T10:00:00Z',
          note: null,
          fit: { met: 0, required: 0, score: 0, strong: false },
        },
      ],
    };
    fetchCandidate.mockResolvedValue(multiAppDetail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    // Should render Mobile Developer (the latest application a2) instead of QA Manual Test New Ui (a1)
    expect(screen.getByText('Mobile Developer')).toBeInTheDocument();
    expect(screen.queryByText('QA Manual Test New Ui')).not.toBeInTheDocument();
  });

  it('selects application matching requisitionId prop when provided', async () => {
    const multiAppDetail: CandidateDetail = {
      ...detail,
      applications: [
        {
          application_id: 'a1',
          requisition_id: 'r1',
          requisition_title: 'QA Manual Test New Ui',
          requisition_status: 'open',
          account_id: null,
          stage: 'new',
          status: 'transferred',
          rating: null,
          tags: [],
          version: 1,
          applied_at: '2026-07-22T10:00:00Z',
          note: null,
          fit: { met: 0, required: 0, score: 0, strong: false },
        },
        {
          application_id: 'a2',
          requisition_id: 'r2',
          requisition_title: 'Mobile Developer',
          requisition_status: 'open',
          account_id: null,
          stage: 'screening',
          status: 'active',
          rating: null,
          tags: [],
          version: 2,
          applied_at: '2026-07-30T10:00:00Z',
          note: null,
          fit: { met: 0, required: 0, score: 0, strong: false },
        },
      ],
    };
    fetchCandidate.mockResolvedValue(multiAppDetail);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" requisitionId="r1" onClose={() => {}} />, {
      wrapper: wrap(qc),
    });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());

    // Matches requisitionId r1 -> QA Manual Test New Ui
    expect(screen.getByText('QA Manual Test New Ui')).toBeInTheDocument();
  });
});
