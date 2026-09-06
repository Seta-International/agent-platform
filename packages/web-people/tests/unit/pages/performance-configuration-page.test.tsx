import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PerformanceConfigResponse } from '../../../src/api/people-client.ts';

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchPerformanceConfig: vi.fn(),
  savePerformanceConfig: vi.fn(),
}));

import { fetchPerformanceConfig } from '../../../src/api/people-client.ts';
import { PerformanceConfigurationPage } from '../../../src/pages/performance-configuration-page.tsx';
import type { PerformanceScopeContextValue } from '../../../src/state/performance-scope-context.tsx';
import { PerformanceScopeProvider } from '../../../src/state/performance-scope-context.tsx';

const ACCOUNT = '44444444-4444-4444-8444-444444444444';

function config(): PerformanceConfigResponse {
  return {
    account_id: ACCOUNT,
    revision_no: 3,
    revision_id: '55555555-5555-4555-8555-555555555555',
    applies_to_next_cycle: false,
    groups: [
      {
        group_id: '66666666-6666-4666-8666-666666666661',
        code: 'delivery',
        name: 'Delivery',
        sort: 1,
        weight: 100,
        criteria: [
          {
            id: '77777777-7777-4777-8777-777777777771',
            name: 'Throughput & velocity',
            weight: 100,
            sort: 0,
          },
        ],
      },
    ],
  };
}

const capacity = { kind: 'am', account_id: ACCOUNT, label: 'Teacher Zone' } as const;

const scope = {
  person_id: '11111111-1111-4111-8111-111111111111',
  role_slugs: [],
  capacities: [capacity],
  can_view_org: false,
  can_unlock: false,
  resolved: { mode: 'capacity', month: '2026-09', capacity },
  search: {},
  setMonth: () => {},
} as unknown as PerformanceScopeContextValue;

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <PerformanceScopeProvider value={scope}>{children}</PerformanceScopeProvider>
    </QueryClientProvider>
  );

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<PerformanceConfigurationPage />, { wrapper: wrap(qc) });
}

const publish = () => screen.getByTestId('performance-config-publish');

describe('PerformanceConfigurationPage weights', () => {
  beforeEach(() => {
    vi.mocked(fetchPerformanceConfig).mockReset();
    vi.mocked(fetchPerformanceConfig).mockResolvedValue(config());
  });

  it('keeps a decimal group weight on screen and names the whole-number rule', async () => {
    renderPage();

    const field = await screen.findByLabelText('Delivery group weight');
    await userEvent.clear(field);
    await userEvent.type(field, '19.9');
    await userEvent.tab();

    // The old field swallowed anything off its min/max and blanked itself on blur.
    // The description also carries the "%" units suffix, hence the pattern.
    expect(field).toHaveValue(19.9);
    expect(field).toHaveAccessibleDescription(/Whole numbers only\./);
    expect(publish()).toBeDisabled();
  });

  it('names the above-zero rule for a criterion weight of nothing', async () => {
    renderPage();

    const field = await screen.findByLabelText('Weight');
    await userEvent.clear(field);
    await userEvent.type(field, '0');

    expect(field).toHaveValue(0);
    expect(field).toHaveAccessibleDescription(/Weight must be greater than 0%\./);
    expect(publish()).toBeDisabled();
  });

  it('refuses the keys that would wipe the box mid-keystroke', async () => {
    renderPage();

    const field = await screen.findByLabelText('Delivery group weight');
    // A lone "e" or "-" is not a number, so the browser reports the value as empty and
    // the controlled field blanks itself — the disappearing act this screen was
    // reported for. None of them is ever part of a percentage.
    // fireEvent.keyDown returns false when a handler called preventDefault.
    for (const key of ['e', 'E', '+', '-']) {
      expect(fireEvent.keyDown(field, { key })).toBe(false);
    }
    for (const key of ['2', '0', 'Backspace']) {
      expect(fireEvent.keyDown(field, { key })).toBe(true);
    }
  });

  it('publishes once every weight is a whole number above zero', async () => {
    renderPage();

    const field = await screen.findByLabelText('Delivery group weight');
    await userEvent.clear(field);
    await userEvent.type(field, '19.9');
    expect(publish()).toBeDisabled();

    await userEvent.clear(field);
    await userEvent.type(field, '100');

    expect(field).not.toHaveAccessibleDescription(/whole numbers|greater than 0/i);
    expect(publish()).toBeEnabled();
  });
});
