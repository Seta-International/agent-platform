import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from '../../../src/pages/projects-page.tsx';

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}));

const fetchProjectsMock = vi.fn(() => Promise.resolve<unknown[]>([]));
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchProjects: () => fetchProjectsMock(),
  };
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectsPage />
    </QueryClientProvider>,
  );
}

describe('ProjectsPage — table (sort · pagination parity)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchProjectsMock.mockReset();
    fetchProjectsMock.mockResolvedValue([]);
  });

  it('resets to page 1 when the sort order changes while on page 2', async () => {
    // Matches the deleted DataTable's TanStack `autoResetPageIndex` default, which fired on
    // `sorting` state changes too, not just filters (getSortedRowModel unconditionally calls
    // `table._autoResetPageIndex()`).
    const user = userEvent.setup();
    const manyRows = Array.from({ length: 26 }, (_, i) => ({
      project_id: `p${i}`,
      name: `Project ${String(i).padStart(2, '0')}`,
      phase: 'build',
      status: 'active' as const,
      pm_worker_id: null,
    }));
    fetchProjectsMock.mockResolvedValue(manyRows);
    renderPage();

    const table = await screen.findByRole('table');
    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: 'Go to page 2' }));
    expect(within(table).getByText('Project 25')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: /sort by phase/i }));

    expect(within(pager).getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(table).getByText('Project 00')).toBeInTheDocument();
    expect(within(table).queryByText('Project 25')).not.toBeInTheDocument();
  });
});

describe('ProjectsPage — breadcrumb trail (Astryx migration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchProjectsMock.mockReset();
    fetchProjectsMock.mockResolvedValue([]);
  });

  it('renders the root crumb and the current (terminal) "Projects" crumb', async () => {
    renderPage();

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const rootCrumb = within(nav).getByRole('link', { name: 'Project Monitoring' });
    expect(rootCrumb).toHaveAttribute('href', '/pm');

    // Current crumb — manifest label and page title agree ("Projects"), not a link.
    expect(within(nav).getByText('Projects').closest('a')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
  });
});
