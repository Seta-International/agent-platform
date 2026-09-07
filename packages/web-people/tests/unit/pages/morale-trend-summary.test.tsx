import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

function monthsBack(count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(thisMonth, -(count - 1 - i)));
}

function trendOver(
  months: string[],
  responsesPerMonth: number[],
  minResponses = 4,
): MoraleTrendResponse {
  const points = months.map((period, i) => ({
    period,
    responses: responsesPerMonth[i] ?? 0,
    average: (responsesPerMonth[i] ?? 0) >= minResponses ? 4.2 : null,
  }));
  return {
    from_month: months[0] as string,
    to_month: months.at(-1) as string,
    min_responses: minResponses,
    total_responses: points.reduce((n, p) => n + p.responses, 0),
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

describe('Morale trend total summary', () => {
  it('says how many months the total was gathered over', async () => {
    fetchMoraleTrend.mockResolvedValue(trendOver(monthsBack(2), [0, 9]));

    renderTab();

    // A bare "9 responses" reads as a headcount until the window is named — nine over two
    // months and nine over a year are different claims about the same number.
    expect(await screen.findByText(/responses across 2 months/)).toBeInTheDocument();
  });

  it('names the month itself when the window is a single one', async () => {
    fetchMoraleTrend.mockResolvedValue(trendOver(monthsBack(1), [9]));

    renderTab();

    // "across 1 month" says less than the month's own name, and the name is what the
    // reader would have to scroll to the pickers to recover. Built from the clock rather
    // than written out, so the test does not start failing at the next month boundary.
    const named = new RegExp(`responses in ${monthLongLabel(thisMonth)}`);
    expect(await screen.findByText(named)).toBeInTheDocument();
    expect(screen.queryByText(/across 1 month/)).not.toBeInTheDocument();
  });

  it('drops the total when there is nothing to plot', async () => {
    // Two responses against a threshold of four: the window has data, none of it
    // publishable.
    fetchMoraleTrend.mockResolvedValue(trendOver(monthsBack(2), [0, 2]));

    renderTab();
    await screen.findByText(/Not enough responses/);

    // The total is the chart's headline, not the tab's. Left standing above an empty
    // state it reads as a figure the page is withholding rather than one it cannot show.
    expect(screen.queryByText(/responses across/)).not.toBeInTheDocument();
    expect(screen.queryByText('2', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('keeps the count singular for a lone response', async () => {
    // `min_responses: 1` so the single response is plottable at all — with the server's
    // usual threshold of four there would be no chart, and therefore no total to check
    // the wording of. The threshold travels on the response precisely so it can move.
    fetchMoraleTrend.mockResolvedValue(trendOver(monthsBack(3), [0, 1, 0], 1));

    renderTab();

    expect(await screen.findByText(/^response across 3 months$/)).toBeInTheDocument();
  });
});
