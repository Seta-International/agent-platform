import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeoplePage } from '../../../src/pages/people-page.tsx';

vi.mock('@seta/web-identity', () => ({
  usePermission: () => false,
}));

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

const mockFetchWorkers = vi.fn();
vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchWorkers: (...args: unknown[]) => mockFetchWorkers(...args),
}));

const mockRows = [
  {
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
  },
  {
    worker_id: 'w2',
    full_name: 'Grace Hopper',
    job_title: 'Architect',
    work_email: 'grace@seta.dev',
    phone: null,
    gender: null,
    lifecycle_stage: 'active',
    onboarding_date: null,
    offboarding_date: null,
    manager_id: null,
    manager_name: null,
    accounts: [],
    skills: [],
  },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PeoplePage />
    </QueryClientProvider>,
  );
}

describe('PeoplePage (Astryx Table migration)', () => {
  it('renders workers in the table', async () => {
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 2 });
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(table).getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('clicking a sort header rewrites the sort query param (server-mode mapper)', async () => {
    const user = userEvent.setup();
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 2 });
    renderPage();

    const table = await screen.findByRole('table');
    await user.click(within(table).getByRole('button', { name: /sort by employee/i }));

    await waitFor(() =>
      expect(mockFetchWorkers).toHaveBeenCalledWith(
        expect.objectContaining({ sort: { field: 'full_name', dir: 'asc' } }),
      ),
    );
  });

  it('changing page updates the query page (1-based pager <-> 1-based query.page)', async () => {
    const user = userEvent.setup();
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 60 });
    renderPage();

    const pager = await screen.findByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: /go to page 2/i }));

    await waitFor(() =>
      expect(mockFetchWorkers).toHaveBeenCalledWith(expect.objectContaining({ page: 2 })),
    );
  });

  it('toggling a column via the Columns popover hides it from the table', async () => {
    const user = userEvent.setup();
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 2 });
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Work email')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Work email' }));

    expect(within(table).queryByText('Work email')).not.toBeInTheDocument();
  });

  // FUT-856: Re-enabling a hidden column must restore it to its canonical (default) position,
  // not append it per the re-enable order. Hide Employee + Work email, re-enable Work email first
  // then Employee — the table must still show Employee before Work email.
  it('restores re-enabled columns to their default position', async () => {
    const user = userEvent.setup();
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 2 });
    renderPage();

    const table = await screen.findByRole('table');
    const headerNames = () =>
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent?.replace(/\s+/g, ' ').trim());

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Employee' }));
    await user.click(screen.getByRole('checkbox', { name: 'Work email' }));
    expect(headerNames()).not.toContain('Employee');
    expect(headerNames()).not.toContain('Work email');

    // Re-enable (picker stays open; all checkboxes remain present) in the WRONG order:
    // Work email first, then Employee.
    await user.click(screen.getByRole('checkbox', { name: 'Work email' }));
    await user.click(screen.getByRole('checkbox', { name: 'Employee' }));

    expect(headerNames()).toContain('Employee');
    expect(headerNames()).toContain('Work email');
    // Canonical order restored: Employee stays before Work email regardless of re-enable order.
    expect(headerNames().indexOf('Employee')).toBeLessThan(headerNames().indexOf('Work email'));
  });

  it('renders the "no matching people" empty state while a search is active', async () => {
    const user = userEvent.setup();
    mockFetchWorkers.mockResolvedValue({ rows: [], total: 0 });
    renderPage();

    await screen.findByRole('table');
    await user.type(screen.getByPlaceholderText('Search people…'), 'zzz');

    expect(await screen.findByText('No matching people')).toBeInTheDocument();
  });

  // Astryx breadcrumb trail (Astryx migration, FUT-668). The current crumb reads "Employees" —
  // a deliberate exception to the title-wins rule, since the page's own h1 ("People") collides
  // with the app root crumb. "Employees" is the manifest nav label for /people/employees, and
  // matches worker-profile-page's middle crumb. Root and current no longer share text, so the
  // current crumb is queried directly (exact match) instead of via `aria-current` alone.
  it('renders the breadcrumb trail with the Employees current crumb (title-wins exception)', async () => {
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 2 });
    renderPage();

    await screen.findByRole('table');

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'People' });
    expect(rootCrumb).toHaveAttribute('href', '/people');

    // Current (terminal) crumb is "Employees", not a link.
    const currentCrumb = within(nav).getByText('Employees');
    expect(currentCrumb).toHaveAttribute('aria-current', 'page');
    expect(currentCrumb.closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'People' })).toBeInTheDocument();
  });
});
