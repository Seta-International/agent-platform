import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffingPlanLine } from '../../../src/api/pm-client.ts';
import { StaffingPlanSection } from '../../../src/pages/staffing-plan-section.tsx';

const fetchStaffingPlanMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchStaffingPlan: (id: string) => fetchStaffingPlanMock(id),
    upsertStaffingPlanLine: vi.fn(),
    deleteStaffingPlanLine: vi.fn(),
  };
});

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StaffingPlanSection projectId="p1" canManage={false} />
    </QueryClientProvider>,
  );
}

describe('StaffingPlanSection — table (sort · pagination parity)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchStaffingPlanMock.mockReset();
  });

  it('resets to page 1 when the sort order changes while on page 2', async () => {
    // Matches the deleted DataTable's TanStack `autoResetPageIndex` default, which fired on
    // `sorting` state changes too, not just filters (getSortedRowModel unconditionally calls
    // `table._autoResetPageIndex()`).
    const user = userEvent.setup();
    const manyRows: StaffingPlanLine[] = Array.from({ length: 26 }, (_, i) => ({
      line_id: `line-${i}`,
      role: `Role ${String(i).padStart(2, '0')}`,
      effort_mm: '1',
      skills: null,
      version: 1,
    }));
    fetchStaffingPlanMock.mockResolvedValue(manyRows);
    renderSection();

    const table = await screen.findByRole('table');
    const pager = screen.getByRole('navigation', { name: /table pagination/i });
    await user.click(within(pager).getByRole('button', { name: 'Go to page 2' }));
    expect(within(table).getByText('Role 25')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: /sort by effort/i }));

    expect(within(pager).getByRole('button', { name: 'Go to page 1' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(table).getByText('Role 00')).toBeInTheDocument();
    expect(within(table).queryByText('Role 25')).not.toBeInTheDocument();
  });
});
