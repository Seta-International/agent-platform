import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CycleUnlockEntry } from '../../../src/api/people-client.ts';

vi.mock('../../../src/api/people-client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/api/people-client.ts')>()),
  fetchCycleUnlocks: vi.fn(),
  unlockCycle: vi.fn(),
  relockCycle: vi.fn(),
}));

import { fetchCycleUnlocks, relockCycle, unlockCycle } from '../../../src/api/people-client.ts';
import { CycleUnlockPanel } from '../../../src/components/cycle-unlock-panel.tsx';

const wrap =
  (qc: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

function qc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function monthUnlockEntry(): CycleUnlockEntry {
  return {
    id: 'e1',
    review_month: '2026-07',
    scope_kind: 'month',
    scope_id: null,
    action: 'unlock',
    reason: 'Payroll correction',
    actor_person_id: null,
    actor_user_id: 'u1',
    created_at: '2026-08-13T02:00:00.000Z',
  };
}

describe('CycleUnlockPanel', () => {
  beforeEach(() => {
    vi.mocked(unlockCycle).mockReset();
    vi.mocked(relockCycle).mockReset();
    vi.mocked(fetchCycleUnlocks).mockReset();
  });

  it('locked cycle: Unlock is disabled until a reason is entered, then submits an unlock', async () => {
    vi.mocked(fetchCycleUnlocks).mockResolvedValue({ month: '2026-07', entries: [] });
    vi.mocked(unlockCycle).mockResolvedValue(monthUnlockEntry());

    render(<CycleUnlockPanel month="2026-07" />, { wrapper: wrap(qc()) });

    const button = await screen.findByRole('button', { name: /Unlock Jul 2026/ });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox', { name: /Reason/ }), 'Reopen for corrections');
    expect(button).toBeEnabled();

    await userEvent.click(button);
    await waitFor(() =>
      expect(unlockCycle).toHaveBeenCalledWith({
        month: '2026-07',
        scope_kind: 'month',
        scope_id: null,
        reason: 'Reopen for corrections',
      }),
    );
  });

  it('unlocked cycle: shows Re-lock and the activity trail', async () => {
    vi.mocked(fetchCycleUnlocks).mockResolvedValue({
      month: '2026-07',
      entries: [monthUnlockEntry()],
    });

    render(<CycleUnlockPanel month="2026-07" />, { wrapper: wrap(qc()) });

    expect(await screen.findByRole('button', { name: /Re-lock Jul 2026/ })).toBeInTheDocument();
    expect(screen.getByTestId('cycle-unlock-trail')).toHaveTextContent('Payroll correction');
  });
});
