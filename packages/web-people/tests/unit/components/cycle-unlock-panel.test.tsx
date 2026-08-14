import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CycleUnlockEntry, CycleUnlockPanelData } from '../../../src/api/people-client.ts';

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchCycleUnlockPanel: vi.fn(),
  unlockCycle: vi.fn(),
  relockCycle: vi.fn(),
}));

import { fetchCycleUnlockPanel, relockCycle, unlockCycle } from '../../../src/api/people-client.ts';
import { CycleUnlockPanel } from '../../../src/components/cycle-unlock-panel.tsx';

const NOW = new Date('2026-08-13T02:00:00.000Z');
const ACME = '11111111-1111-4111-8111-111111111111';
const GLOBEX = '22222222-2222-4222-8222-222222222222';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function qc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function panel(over: Partial<CycleUnlockPanelData> = {}): CycleUnlockPanelData {
  return {
    unlockable_month: '2026-07',
    max_days: 5,
    accounts: [
      { account_id: ACME, name: 'Acme', unlocked_until: null },
      { account_id: GLOBEX, name: 'Globex', unlocked_until: null },
    ],
    entries: [],
    ...over,
  };
}

function entry(over: Partial<CycleUnlockEntry> = {}): CycleUnlockEntry {
  return {
    id: 'e1',
    review_month: '2026-07',
    account_id: ACME,
    action: 'unlock',
    expires_at: '2026-08-15T02:00:00.000Z',
    reason: 'Payroll correction',
    actor_person_id: null,
    actor_user_id: 'u1',
    created_at: '2026-08-13T02:00:00.000Z',
    ...over,
  };
}

describe('CycleUnlockPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true });
    vi.mocked(unlockCycle).mockReset();
    vi.mocked(relockCycle).mockReset();
    vi.mocked(fetchCycleUnlockPanel).mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reopens the selected account for the chosen number of days', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(fetchCycleUnlockPanel).mockResolvedValue(panel());
    vi.mocked(unlockCycle).mockResolvedValue(entry());

    render(<CycleUnlockPanel />, { wrapper: wrap(qc()) });

    const button = await screen.findByRole('button', { name: /Reopen account/ });
    expect(button).toBeDisabled(); // reason is mandatory

    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.click(screen.getByRole('option', { name: 'Globex' }));

    await user.click(screen.getByRole('combobox', { name: 'Reopen for' }));
    await user.click(screen.getByRole('option', { name: '2 days' }));

    await user.type(screen.getByRole('textbox', { name: /Reason/ }), 'Late TL reviews');
    expect(button).toBeEnabled();

    await user.click(button);
    await waitFor(() =>
      expect(unlockCycle).toHaveBeenCalledWith({
        month: '2026-07',
        account_id: GLOBEX,
        days: 2,
        reason: 'Late TL reviews',
      }),
    );
  });

  it('offers no more than the server-declared max_days of reopening', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(fetchCycleUnlockPanel).mockResolvedValue(panel({ max_days: 3 }));

    render(<CycleUnlockPanel />, { wrapper: wrap(qc()) });

    await user.click(await screen.findByRole('combobox', { name: 'Reopen for' }));
    expect(screen.getByRole('option', { name: '1 day' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '3 days' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '4 days' })).not.toBeInTheDocument();
  });

  it('an open account shows its countdown and can be closed early', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(fetchCycleUnlockPanel).mockResolvedValue(
      panel({
        accounts: [
          { account_id: ACME, name: 'Acme', unlocked_until: '2026-08-15T02:00:00.000Z' },
          { account_id: GLOBEX, name: 'Globex', unlocked_until: null },
        ],
        entries: [entry()],
      }),
    );
    vi.mocked(relockCycle).mockResolvedValue(
      entry({ id: 'e2', action: 'relock', expires_at: null }),
    );

    render(<CycleUnlockPanel />, { wrapper: wrap(qc()) });

    expect(await screen.findByText(/2 days left/)).toBeInTheDocument();
    // No days picker while a window is already open — the only action is closing it.
    expect(screen.queryByRole('combobox', { name: 'Reopen for' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Reason/ }), 'Corrections done');
    await user.click(screen.getByRole('button', { name: /Close now/ }));

    await waitFor(() =>
      expect(relockCycle).toHaveBeenCalledWith({
        month: '2026-07',
        account_id: ACME,
        reason: 'Corrections done',
      }),
    );
  });

  it('names the only reopenable cycle and lists the trail', async () => {
    vi.mocked(fetchCycleUnlockPanel).mockResolvedValue(panel({ entries: [entry()] }));

    render(<CycleUnlockPanel />, { wrapper: wrap(qc()) });

    expect(await screen.findByText(/Reopen Jul 2026/)).toBeInTheDocument();
    const trail = screen.getByTestId('cycle-unlock-trail');
    expect(trail).toHaveTextContent('Payroll correction');
    expect(trail).toHaveTextContent('Acme');
  });
});
