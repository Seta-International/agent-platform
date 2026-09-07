import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MoraleTrendRange, MoraleTrendResponse } from '../../../src/api/people-client.ts';
import { shiftMonth, vnMonth } from '../../../src/pages/morale-labels.ts';
import { describeTrend, MoraleTrendTab } from '../../../src/pages/morale-trend-tab.tsx';

const fetchMoraleTrend = vi.fn<(range: MoraleTrendRange) => Promise<MoraleTrendResponse>>();

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchMoraleTrend: (range: MoraleTrendRange) => fetchMoraleTrend(range),
}));

const thisMonth = vnMonth(new Date());
const lastMonth = shiftMonth(thisMonth, -1);

function trendWith(points: MoraleTrendResponse['points']): MoraleTrendResponse {
  return {
    from_month: lastMonth,
    to_month: thisMonth,
    min_responses: 4,
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

describe('Morale trend scale and default window', () => {
  it('opens on last month through this month', async () => {
    fetchMoraleTrend.mockResolvedValue(
      trendWith([
        { period: lastMonth, responses: 6, average: 3.5 },
        { period: thisMonth, responses: 9, average: 4.2 },
      ]),
    );

    renderTab();
    await screen.findByText('15');

    // The window the tab opens on, not merely what the pickers happen to display: a
    // wider default would be a different question asked of the server.
    expect(fetchMoraleTrend).toHaveBeenCalledWith({
      from_month: lastMonth,
      to_month: thisMonth,
    });
  });

  it('spells out what each point on the 1-5 axis means', async () => {
    fetchMoraleTrend.mockResolvedValue(
      trendWith([{ period: thisMonth, responses: 9, average: 4.2 }]),
    );

    renderTab();

    // The same words the sender picked from, so a 4 on the chart reads back as the
    // "Happy" they chose rather than as a bare number.
    const legend = await screen.findByText(/Rating scale/);
    for (const word of ['Very happy', 'Happy', 'Neutral', 'Unhappy', 'Very unhappy']) {
      expect(legend.textContent).toContain(word);
    }
  });

  it('drops the scale legend when there is no chart to read it against', async () => {
    fetchMoraleTrend.mockResolvedValue(
      trendWith([{ period: thisMonth, responses: 2, average: null }]),
    );

    renderTab();
    await screen.findByText(/Not enough responses/);

    // The legend, the glyph key and the withholding rule all annotate a chart. With no
    // chart they annotate nothing, and three lines of small print under a single sentence
    // of explanation bury the sentence.
    expect(screen.queryByText(/Rating scale/)).not.toBeInTheDocument();
    expect(screen.queryByText(/shape, not colour/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stay hidden/)).not.toBeInTheDocument();
  });

  it('names both ends of the scale for a reader who never sees the legend', () => {
    expect(describeTrend([{ period: thisMonth, responses: 9, average: 4.2 }], 4)).toContain(
      'from 1 Very unhappy to 5 Very happy',
    );
  });
});
