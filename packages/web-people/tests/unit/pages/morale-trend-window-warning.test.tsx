import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MoraleTrendRange, MoraleTrendResponse } from '../../../src/api/people-client.ts';
import { monthLongLabel, shiftMonth, vnMonth } from '../../../src/pages/morale-labels.ts';
import { MoraleTrendTab } from '../../../src/pages/morale-trend-tab.tsx';

const fetchMoraleTrend = vi.fn<(range: MoraleTrendRange) => Promise<MoraleTrendResponse>>();

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchMoraleTrend: (range: MoraleTrendRange) => fetchMoraleTrend(range),
}));

const thisMonth = vnMonth(new Date());

/** A window ending this month, `span` months long, always with something to plot. */
function trendSpanning(span: number): MoraleTrendResponse {
  const points = Array.from({ length: span }, (_, i) => ({
    period: shiftMonth(thisMonth, -(span - 1 - i)),
    responses: 9,
    average: 4.2,
  }));
  return {
    from_month: points[0]?.period as string,
    to_month: thisMonth,
    min_responses: 4,
    total_responses: span * 9,
    points,
  };
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoraleTrendTab />
    </QueryClientProvider>,
  );
}

/** Picks a month in the named combobox by its long label. */
async function pickMonth(field: string, month: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: new RegExp(field) }));
  await user.click(await screen.findByRole('option', { name: monthLongLabel(month) }));
}

describe('Morale trend window warning', () => {
  it('says nothing at twelve months', async () => {
    fetchMoraleTrend.mockResolvedValue(trendSpanning(12));

    renderTab();
    await screen.findByText(/responses across 12 months/);

    // Twelve is the boundary, and the boundary itself is allowed: a full year is the
    // ordinary question this tab exists to answer.
    expect(screen.queryByText(/longer than 12 months/)).not.toBeInTheDocument();
  });

  it('warns once the window runs past twelve months', async () => {
    fetchMoraleTrend.mockResolvedValue(trendSpanning(13));

    renderTab();
    await pickMonth('From month', shiftMonth(thisMonth, -12));

    // A warning, not a block: the data is still fetched and drawn. What it says is that
    // the axis is now crowded enough to mislead, which is a judgement for the reader.
    expect(await screen.findByText(/longer than 12 months/)).toBeInTheDocument();
    expect(screen.queryByText(/Not enough responses/)).not.toBeInTheDocument();
  });
});
