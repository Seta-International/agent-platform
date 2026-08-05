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
    await user.click(within(table).getByRole('button', { name: /sort by name/i }));

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

  it('renders the "no matching people" empty state while a search is active', async () => {
    const user = userEvent.setup();
    mockFetchWorkers.mockResolvedValue({ rows: [], total: 0 });
    renderPage();

    await screen.findByRole('table');
    await user.type(screen.getByPlaceholderText('Search people…'), 'zzz');

    expect(await screen.findByText('No matching people')).toBeInTheDocument();
  });

  it('renders the breadcrumb trail and page title', async () => {
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
    expect(screen.getByRole('heading', { level: 1, name: 'Employees' })).toBeInTheDocument();
  });

  it('renders Account column with CounterBadgePopover limiting to 2 tags and showing +N indicator with hover popover', async () => {
    const user = userEvent.setup();
    const rowsWithMultipleAccounts = [
      {
        ...mockRows[0],
        accounts: [
          { id: 'a1', name: 'Motion Global' },
          { id: 'a2', name: 'AVIA' },
          { id: 'a3', name: 'Commerce Canal' },
        ],
      },
    ];
    mockFetchWorkers.mockResolvedValue({ rows: rowsWithMultipleAccounts, total: 1 });
    renderPage();

    const table = await screen.findByRole('table');
    expect(within(table).getAllByText('Motion Global')[0]).toBeInTheDocument();
    expect(within(table).getAllByText('AVIA')[0]).toBeInTheDocument();
    const overflowBtn = within(table).getByRole('button', { name: '+1' });
    expect(overflowBtn).toBeInTheDocument();

    await user.hover(overflowBtn);
    expect(await screen.findByText('Commerce Canal')).toBeInTheDocument();
  });
});
