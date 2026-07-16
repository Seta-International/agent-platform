import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectAccessRow } from '../../../src/api/pm-client.ts';
import { ProjectAccessSection } from '../../../src/pages/project-access-section.tsx';

vi.mock('../../../src/api/worker-search.ts', () => ({
  useWorkerSource: () => ({
    source: { search: () => Promise.resolve([]), bootstrap: () => Promise.resolve([]) },
    seed: () => Promise.resolve([]),
  }),
}));

const fetchProjectAccessMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchProjectAccess: (id: string) => fetchProjectAccessMock(id),
    setProjectAccess: vi.fn(),
  };
});

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectAccessSection projectId="p1" canManage={false} />
    </QueryClientProvider>,
  );
}

describe('ProjectAccessSection — table (sort · pagination parity)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchProjectAccessMock.mockReset();
  });

  it('resets to page 1 when the sort order changes while on page 2', async () => {
    // Matches the deleted DataTable's TanStack `autoResetPageIndex` default, which fired on
    // `sorting` state changes too, not just filters (getSortedRowModel unconditionally calls
    // `table._autoResetPageIndex()`).
    const user = userEvent.setup();
    const manyRows: ProjectAccessRow[] = Array.from({ length: 26 }, (_, i) => ({
      worker_id: `worker-${String(i).padStart(2, '0')}`,
      level: 'view',
    }));
    fetchProjectAccessMock.mockResolvedValue(manyRows);
    renderSection();

    const table = await screen.findByRole('table');
    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: 'Go to page 2' }));
    expect(within(table).getByText('worker-25')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: /sort by level/i }));

    expect(within(pager).getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(table).getByText('worker-00')).toBeInTheDocument();
    expect(within(table).queryByText('worker-25')).not.toBeInTheDocument();
  });
});
