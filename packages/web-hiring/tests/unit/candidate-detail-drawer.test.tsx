import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateDetail } from '../../src/api/hiring-client.ts';

const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@seta/shared-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@seta/shared-ui')>()),
  toast,
}));
const fetchCandidate = vi.fn();
const moveApplicationStage = vi.fn();
const editCandidate = vi.fn();
const requestCandidateCvUpload = vi.fn();
const putCvToS3 = vi.fn();
const getCandidateCvDownloadUrl = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});
vi.mock('../../src/api/hiring-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/api/hiring-client.ts')>()),
  fetchCandidate: (id: string) => fetchCandidate(id),
  moveApplicationStage: (id: string, input: unknown) => moveApplicationStage(id, input),
  editCandidate: (...args: unknown[]) => editCandidate(...args),
  requestCandidateCvUpload: (...args: unknown[]) => requestCandidateCvUpload(...args),
  putCvToS3: (url: string, file: File) => putCvToS3(url, file),
  getCandidateCvDownloadUrl: (id: string) => getCandidateCvDownloadUrl(id),
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
  ],
};

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
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
    // Fields with no schema support are labeled honestly instead of fabricated.
    expect(screen.getAllByText('No Data').length).toBeGreaterThan(0);
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

    expect(toast.error).toHaveBeenCalledWith('CV must be under 10MB');
  });

  it('shows No CV on file when cv_storage_key is null', async () => {
    fetchCandidate.mockResolvedValue({
      ...detail,
      candidate: { ...detail.candidate, cv_storage_key: null },
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<CandidateDetailDrawer candidateId="c1" onClose={() => {}} />, { wrapper: wrap(qc) });
    await waitFor(() => expect(screen.getByText('Ada Lovelace')).toBeInTheDocument());
    expect(screen.getByText('No CV on file')).toBeInTheDocument();
    expect(screen.getByText('Upload')).toBeInTheDocument();
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
