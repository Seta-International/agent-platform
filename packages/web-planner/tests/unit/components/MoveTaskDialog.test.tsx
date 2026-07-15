import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MoveTaskDialog } from '../../../src/components/MoveTaskDialog';

vi.mock('../../../src/api/planner-client', () => ({
  plannerClient: {
    listPlans: vi
      .fn()
      .mockResolvedValue([
        { id: 'p-b', name: 'Beta', group_id: 'g1', deleted_at: null, external_source: null },
      ]),
    listMyGroups: vi.fn().mockResolvedValue([{ id: 'g1', name: 'Group One' }]),
    listBuckets: vi.fn().mockResolvedValue([
      { id: 'bk1', name: 'Backlog', order_hint: 'a' },
      { id: 'bk2', name: 'Doing', order_hint: 'b' },
    ]),
  },
}));

function renderDialog(onConfirm = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MoveTaskDialog
        open
        onOpenChange={vi.fn()}
        taskTitle="T"
        currentPlanId="p-current"
        hasLabels={false}
        onConfirm={onConfirm}
      />
    </QueryClientProvider>,
  );
  return { onConfirm };
}

describe('MoveTaskDialog', () => {
  it('enables the bucket picker after a plan is chosen and confirms the target', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    // choose the plan — Astryx `Selector` with `hasSearch` renders the trigger
    // as a plain button (the search input inside the popup owns role="combobox"),
    // named via the Field's associated <label>.
    await user.click(await screen.findByRole('button', { name: /target plan/i }));
    await user.click(await screen.findByRole('option', { name: /Beta/ }));
    // choose the bucket
    await user.click(await screen.findByRole('button', { name: /target bucket/i }));
    await user.click(await screen.findByRole('option', { name: /Doing/ }));

    await user.click(screen.getByRole('button', { name: /^move$/i }));
    expect(onConfirm).toHaveBeenCalledWith({
      targetPlanId: 'p-b',
      targetBucketId: 'bk2',
      targetPlanName: 'Beta',
    });
  });
});
