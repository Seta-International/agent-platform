import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PeoplePage } from '../../../src/pages/people-page.tsx';

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
    photo_url: '/api/people/v1/workers/w1/photo',
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
    photo_url: null,
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

  it('renders the M365 photo in the Employee cell, and initials for a person without one', async () => {
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 2 });
    renderPage();

    const table = await screen.findByRole('table');
    const ada = within(table).getByRole('img', { name: 'Ada Lovelace' });
    expect(ada.querySelector('img')).toHaveAttribute('src', '/api/people/v1/workers/w1/photo');

    const grace = within(table).getByRole('img', { name: 'Grace Hopper' });
    expect(grace.querySelector('img')).toBeNull();
    expect(grace).toHaveTextContent('GH');
  });

  it('does not render the Add Employee button in List view (FUT-929 AC1/AC2)', async () => {
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 2 });
    renderPage();

    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /add employee/i })).not.toBeInTheDocument();
  });

  it('does not render the Add Employee button in Cards view (FUT-929 AC1/AC2)', async () => {
    const user = userEvent.setup();
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 2 });
    renderPage();

    await screen.findByRole('table');
    const cardsRadio = screen.getByRole('radio', { name: 'Cards' });
    await user.click(cardsRadio);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add employee/i })).not.toBeInTheDocument();
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

  // FUT-856: Re-enabling a hidden column must restore it to its canonical (default) position,
  // not append it per the re-enable order. Hide Name + Work email, re-enable Work email first
  // then Name — the table must still show Name before Work email.
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
    await user.click(screen.getByRole('checkbox', { name: 'Name' }));
    await user.click(screen.getByRole('checkbox', { name: 'Work email' }));
    expect(headerNames()).not.toContain('Name');
    expect(headerNames()).not.toContain('Work email');

    // Re-enable (picker stays open; all checkboxes remain present) in the WRONG order:
    // Work email first, then Name.
    await user.click(screen.getByRole('checkbox', { name: 'Work email' }));
    await user.click(screen.getByRole('checkbox', { name: 'Name' }));

    expect(headerNames()).toContain('Name');
    expect(headerNames()).toContain('Work email');
    // Canonical order restored: Name stays before Work email regardless of re-enable order.
    expect(headerNames().indexOf('Name')).toBeLessThan(headerNames().indexOf('Work email'));
  });

  it('renders the "no matching people" empty state while a search is active', async () => {
    const user = userEvent.setup();
    mockFetchWorkers.mockResolvedValue({ rows: [], total: 0 });
    renderPage();

    await screen.findByRole('table');
    await user.type(screen.getByPlaceholderText('Search people…'), 'zzz');

    expect(await screen.findByText('No matching people')).toBeInTheDocument();
  });

  it('renders the "no employees yet" empty state when no employees exist (FUT-929 AC3)', async () => {
    mockFetchWorkers.mockResolvedValue({ rows: [], total: 0 });
    renderPage();

    await screen.findByRole('table');
    expect(await screen.findByText('No employees yet')).toBeInTheDocument();
    expect(await screen.findByText('No employee records found.')).toBeInTheDocument();
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

  it('hides pagination in List view when total items is <= 25', async () => {
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 20 });
    renderPage();

    await screen.findByRole('table');
    expect(screen.queryByRole('navigation', { name: /table pagination/i })).not.toBeInTheDocument();
  });

  it('retains pagination controls in List view when total = 50 and pageSize = 100', async () => {
    mockFetchWorkers.mockResolvedValue({ rows: mockRows, total: 50 });
    renderPage();

    await screen.findByRole('table');
    const pager = await screen.findByRole('navigation', { name: /table pagination/i });
    expect(pager).toBeInTheDocument();
    expect(within(pager).getByRole('combobox', { name: /items per page/i })).toBeInTheDocument();
  });
});
