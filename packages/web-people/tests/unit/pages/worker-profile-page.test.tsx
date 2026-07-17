import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDetail, WorkerHistoryEntry } from '../../../src/api/people-client.ts';
import { WorkerProfilePage } from '../../../src/pages/worker-profile-page.tsx';

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ workerId: 'w1' }),
}));

vi.mock('@seta/web-identity', () => ({
  usePermission: () => false,
}));

const worker: WorkerDetail = {
  worker_id: 'w1',
  full_name: 'Ada Lovelace',
  job_title: 'Engineer',
  work_email: 'ada@seta.dev',
  phone: null,
  gender: null,
  lifecycle_stage: 'active',
  onboarding_date: null,
  offboarding_date: null,
  manager_id: null,
  manager_name: null,
  accounts: [],
  skills: [],
  dob: null,
  personal_email: null,
  cv_storage_key: null,
  emergency_contact: null,
  version: 1,
  org_unit_id: null,
  org_unit_name: null,
};

const history: WorkerHistoryEntry[] = [];

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/people-client.ts')>();
  return {
    ...actual,
    fetchWorker: () => Promise.resolve(worker),
    fetchWorkerHistory: () => Promise.resolve(history),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WorkerProfilePage />
    </QueryClientProvider>,
  );
}

describe('WorkerProfilePage — breadcrumb trail (back-link → crumb parity, Astryx migration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Parity gate: the middle "Employees" crumb's href must be exactly /people/employees — the
  // manifest nav label for that route, matching people-page.tsx's own current crumb.
  it('renders the full trail with the middle crumb carrying the old back-link href', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'People' });
    expect(rootCrumb).toHaveAttribute('href', '/people');

    const parentCrumb = within(nav).getByRole('link', { name: 'Employees' });
    expect(parentCrumb).toHaveAttribute('href', '/people/employees');

    // Current (terminal) crumb is the worker's name, not a link.
    expect(within(nav).getByText('Ada Lovelace').closest('a')).toBeNull();
  });
});
