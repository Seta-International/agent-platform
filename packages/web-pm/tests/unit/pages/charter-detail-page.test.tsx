import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CharterDetail } from '../../../src/api/pm-client.ts';
import { CharterDetailPage } from '../../../src/pages/charter-detail-page.tsx';

vi.mock('@seta/web-identity', () => ({
  usePermission: () => true,
  useSession: () => ({ user_id: 'u1' }),
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

// Isolates this page test from the real people-search endpoint (worker name resolution for
// PM/PMO facts) — same rationale as reassign-wizard.test.tsx mocking pm-client directly.
vi.mock('../../../src/api/worker-search.ts', () => ({
  useWorkerSource: () => ({
    source: { search: () => Promise.resolve([]), bootstrap: () => Promise.resolve([]) },
    seed: () => Promise.resolve([]),
  }),
}));

const rejectCharter = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchAccounts: () =>
      Promise.resolve([
        {
          account_id: 'acc1',
          name: 'Aeris',
          industry: null,
          am_worker_id: null,
          recruiter_count: 0,
          project_count: 0,
        },
      ]),
    fetchCharter: () => Promise.resolve(charter),
    rejectCharter: (id: string, reason: string, expectedVersion?: number) =>
      rejectCharter(id, reason, expectedVersion),
  };
});

const charter: CharterDetail = {
  charter_id: 'c1',
  account_id: 'acc1',
  name: 'Watchtower charter',
  pm_worker_id: null,
  pmo_worker_id: null,
  budget_bmm: null,
  team_size: null,
  methodology: null,
  pricing_model: null,
  date_from: null,
  date_to: null,
  objective: null,
  scope: null,
  status: 'submitted',
  rejection_reason: null,
  rejected_stage: null,
  pmo_signed_off_at: null,
  project_id: null,
  submitted_by_user_id: 'u1',
  version: 5,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CharterDetailPage charterId="c1" />
    </QueryClientProvider>,
  );
}

describe('CharterDetailPage — reject-charter dialog (Astryx migration smoke test)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    rejectCharter.mockReset();
  });

  // purpose="required" -> role="alertdialog" (the one destructive/terminal action of the five
  // dialogs in this migration slice). Two "Reject" buttons coexist once open: the header trigger
  // (outside the <dialog> DOM) and the footer's destructive action — within(dialog) disambiguates.
  it('opens as an alertdialog from the header Reject action and closes via Cancel without rejecting', async () => {
    const user = userEvent.setup();
    renderPage();

    const openReject = await screen.findByRole('button', { name: 'Reject' });
    await user.click(openReject);

    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByRole('heading', { name: 'Reject charter' })).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/reason/i), 'Not viable');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(rejectCharter).not.toHaveBeenCalled();
  });

  it('rejects with the typed reason and expected version, closing the dialog on success', async () => {
    rejectCharter.mockResolvedValueOnce({ version: 6 });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('alertdialog');

    await user.type(within(dialog).getByLabelText(/reason/i), 'Budget mismatch');
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() => expect(rejectCharter).toHaveBeenCalledWith('c1', 'Budget mismatch', 5));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});

describe('CharterDetailPage — breadcrumb trail (back-link → crumb parity, Astryx migration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Parity gate: the parent crumb's href must be exactly /pm/requests. Deliberate asymmetry:
  // this middle crumb reads "Requests" (the manifest nav label), while the requests page's own
  // current crumb reads "Project Requests" (title-wins) — only a page's own terminal crumb
  // takes the title-wins clause, not a middle crumb pointing at it.
  it('renders the full trail with the parent crumb carrying the old back-link href', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Watchtower charter' });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Project Monitoring' });
    expect(rootCrumb).toHaveAttribute('href', '/pm');

    const parentCrumb = within(nav).getByRole('link', { name: 'Requests' });
    expect(parentCrumb).toHaveAttribute('href', '/pm/requests');

    // Current (terminal) crumb is the charter name, not a link.
    expect(within(nav).getByText('Watchtower charter').closest('a')).toBeNull();
  });
});
