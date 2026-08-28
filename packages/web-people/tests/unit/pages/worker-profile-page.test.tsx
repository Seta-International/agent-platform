import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDetail, WorkerHistoryEntry } from '../../../src/api/people-client.ts';
import { WorkerProfilePage } from '../../../src/pages/worker-profile-page.tsx';

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ workerId: 'w1' }),
}));

const mockWorker: WorkerDetail = {
  worker_id: 'w1',
  full_name: 'Ada Lovelace',
  employee_no: 'EMP-001',
  job_title: 'Staff Engineer',
  work_email: 'ada@seta.dev',
  personal_email: 'ada.personal@example.com',
  phone: '+84901234567',
  gender: 'female',
  dob: '1990-01-01',
  emergency_contact: 'Charles Babbage (+84907654321)',
  lifecycle_stage: 'active',
  onboarding_date: null,
  offboarding_date: null,
  manager_id: 'm1',
  manager_name: 'Lord Byron',
  accounts: [{ id: 'acc-1', name: 'Alpha Project' }],
  skills: [{ id: 'sk-1', name: 'TypeScript', level: 4 }],
  cv_storage_key: 'cv/w1/resume.pdf',
  version: 1,
  org_unit_id: 'ou-1',
  org_unit_name: 'Engineering',
};

const history: WorkerHistoryEntry[] = [];

let currentWorker: WorkerDetail = mockWorker;

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/people-client.ts')>();
  return {
    ...actual,
    fetchWorker: () => Promise.resolve(currentWorker),
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

describe('WorkerProfilePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    currentWorker = mockWorker;
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

  // FUT-930 AC1: Given an employee profile is displayed, when the page loads, then the Edit button is not displayed for any role
  it('does not display any Edit button on page load', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });

    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  // FUT-930 AC2: Given any role, when viewing an employee profile, then employee information is read-only and cannot be modified
  it('renders employee profile information in read-only field rows without input elements', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });

    // Check read-only field row labels and values
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('EMP-001')).toBeDefined();
    expect(screen.getByText('Staff Engineer')).toBeDefined();
    expect(screen.getByText('Lord Byron')).toBeDefined();
    expect(screen.getByText('Engineering')).toBeDefined();
    expect(screen.getAllByText('ada@seta.dev').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('ada.personal@example.com')).toBeDefined();
    expect(screen.getByText('+84901234567')).toBeDefined();
    expect(screen.getByText('1990-01-01')).toBeDefined();
    expect(screen.getByText('Female')).toBeDefined();
    expect(screen.getByText('Charles Babbage (+84907654321)')).toBeDefined();

    // No text inputs or select elements exist for editing profile info
    expect(screen.queryByLabelText('Full name')).toBeNull();
    expect(screen.queryByLabelText('Employee number')).toBeNull();
    expect(screen.queryByLabelText('Job title')).toBeNull();
    expect(screen.queryByLabelText('Work email')).toBeNull();
    expect(screen.queryByLabelText('Phone')).toBeNull();
    expect(screen.queryByLabelText('Date of birth')).toBeNull();
    expect(screen.queryByLabelText('Gender')).toBeNull();
    expect(screen.queryByLabelText('Emergency contact')).toBeNull();
  });

  it('renders techstack skills in read-only mode without add/remove controls', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });

    expect(screen.getByText('TypeScript')).toBeDefined();
    expect(screen.getByText('4/5')).toBeDefined();

    // No add skill search input or remove buttons
    expect(screen.queryByPlaceholderText(/search to add a skill/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /remove typescript/i })).toBeNull();
  });

  it('renders CV actions in read-only mode (Download button only, no file upload input)', async () => {
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });

    // Download button is present for workers with cv_storage_key
    expect(screen.getByRole('button', { name: 'Download' })).toBeDefined();

    // No file input or upload/replace label
    expect(screen.queryByLabelText(/upload/i)).toBeNull();
    expect(screen.queryByLabelText(/replace/i)).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it('renders "—" for CV when no cv_storage_key is present', async () => {
    currentWorker = { ...mockWorker, cv_storage_key: null };
    renderPage();

    await screen.findByRole('heading', { level: 1, name: 'Ada Lovelace' });

    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
