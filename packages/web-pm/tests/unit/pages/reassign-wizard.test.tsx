import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ProjectListRow,
  type RaMonitoringAllocation,
  removeAllocation,
  updateAllocation,
} from '../../../src/api/pm-client.ts';
import { ReassignWizardDialog } from '../../../src/pages/reassign-wizard.tsx';

vi.mock('../../../src/api/pm-client.ts', async () => {
  const actual = await vi.importActual<typeof import('../../../src/api/pm-client.ts')>(
    '../../../src/api/pm-client.ts',
  );
  return {
    ...actual,
    removeAllocation: vi.fn().mockResolvedValue(undefined),
    updateAllocation: vi.fn().mockResolvedValue({ version: 2 }),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Dates relative to the real "today" so the past/future distinction (FUT-349 lock) stays
// correct no matter when the suite runs.
const isoOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const FUTURE_START = isoOffset(90);
const PAST_START = isoOffset(-90);

function allocation(over: Partial<RaMonitoringAllocation> = {}): RaMonitoringAllocation {
  return {
    allocation_id: 'a1',
    worker_id: 'w1',
    worker_name: 'An Đình Luận',
    worker_title: 'Developer',
    role: null,
    planned_pct: 30,
    bucket: 'billable',
    status: 'committed',
    date_from: FUTURE_START,
    date_to: '2026-12-23',
    note: null,
    project_id: 'p1',
    project_name: 'Aeris - Watchtower',
    account_id: 'acc1',
    account_name: 'Aeris',
    version: 1,
    can_manage: true,
    ...over,
  };
}

function renderWizard(
  allocations: RaMonitoringAllocation[],
  accountOptions: { value: string; label: string }[] = [],
  projects: ProjectListRow[] = [],
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ReassignWizardDialog
        target={{ worker_id: 'w1', worker_name: 'An Đình Luận', worker_title: 'Developer' }}
        allocations={allocations}
        accountOptions={accountOptions}
        projects={projects}
        onClose={() => {}}
        onReassigned={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('ReassignWizardDialog', () => {
  it('lists only future allocations, hiding ones already fully in the past', () => {
    renderWizard([
      allocation({
        allocation_id: 'a1',
        project_name: 'Aeris - Watchtower',
        date_to: '2026-12-23',
      }),
      allocation({ allocation_id: 'a2', project_name: 'Long Gone', date_to: '2020-01-01' }),
    ]);
    expect(screen.getByLabelText('Start date for Aeris - Watchtower')).toBeInTheDocument();
    expect(screen.queryByLabelText('Start date for Long Gone')).not.toBeInTheDocument();
  });

  it('shows every current allocation directly editable, with no select-then-edit step', () => {
    renderWizard([allocation({ date_to: '2026-12-23' })]);

    const endDateInput = screen.getByLabelText(/end date for/i) as HTMLInputElement;
    expect(endDateInput.value).toBe('2026-12-23');
    expect(screen.getByLabelText(/start date for/i)).toBeInTheDocument();
    // Allocation is a 0–1 fraction dropdown now: 30% renders as 0.3.
    expect(screen.getByLabelText(/allocation for/i)).toHaveTextContent('0.3');
    expect(screen.getByLabelText(/account for/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/project for/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save aeris - watchtower/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete aeris - watchtower/i })).toBeInTheDocument();
  });

  it('bumps the end date forward when Start is moved past it, preventing an inverted range', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard([allocation({ date_from: FUTURE_START, date_to: '2026-12-23' })]);

    const startDateInput = screen.getByLabelText(/start date for/i) as HTMLInputElement;
    await user.clear(startDateInput);
    await user.type(startDateInput, '2027-01-01');

    const endDateInput = screen.getByLabelText(/end date for/i) as HTMLInputElement;
    expect(endDateInput.value).toBe('2027-01-01');
  });

  it('calls updateAllocation with the full row patch on Save and displays the newly saved values', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard([allocation({ date_to: '2026-12-23', version: 3 })]);

    const endDateInput = screen.getByLabelText(/end date for/i) as HTMLInputElement;
    await user.clear(endDateInput);
    await user.type(endDateInput, '2026-08-15');

    const noteInput = screen.getByLabelText(/note for/i) as HTMLInputElement;
    await user.type(noteInput, 'Handover in progress');

    await user.click(screen.getByRole('button', { name: /save aeris - watchtower/i }));

    // Allocation is entered as the 0.3 fraction; the wizard converts it back to a percentage.
    expect(updateAllocation).toHaveBeenCalledWith('a1', {
      project_id: 'p1',
      planned_pct: 30,
      date_from: FUTURE_START,
      date_to: '2026-08-15',
      bucket: 'billable',
      note: 'Handover in progress',
      expected_version: 3,
    });
    // Row stays directly editable (no view-mode toggle) — its fields keep
    // reflecting exactly what was just saved.
    expect(endDateInput).toHaveValue('2026-08-15');
    expect(noteInput).toHaveValue('Handover in progress');
  });

  it('locks a past-start allocation to end date and delete only', () => {
    renderWizard([allocation({ date_from: PAST_START, date_to: '2026-12-23' })]);

    // Everything that defines the allocation's terms is read-only once it has started…
    expect(screen.getByLabelText(/account for/i)).toBeDisabled();
    expect(screen.getByLabelText(/project for/i)).toBeDisabled();
    expect(screen.getByLabelText(/allocation for/i)).toBeDisabled();
    expect(screen.getByLabelText(/start date for/i)).toBeDisabled();
    expect(screen.getByLabelText(/type for/i)).toBeDisabled();
    expect(screen.getByLabelText(/note for/i)).toBeDisabled();
    // …but you can still shorten/extend it or remove it entirely.
    expect(screen.getByLabelText(/end date for/i)).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /delete aeris - watchtower/i })).not.toBeDisabled();
  });

  it('lets an existing row be moved to a different account/project, and sends the new project_id on Save', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23', version: 3 })],
      [
        { value: 'acc1', label: 'Aeris' },
        { value: 'acc2', label: 'Veritone' },
      ],
      [
        {
          project_id: 'p1',
          account_id: 'acc1',
          name: 'Aeris - Watchtower',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
          can_manage: true,
        },
        {
          project_id: 'p3',
          account_id: 'acc2',
          name: 'Veritone - Core',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
          can_manage: true,
        },
      ],
    );

    await user.click(screen.getByLabelText(/account for/i));
    await user.click(await screen.findByRole('option', { name: 'Veritone' }));
    await user.click(screen.getByLabelText(/project for/i));
    await user.click(await screen.findByRole('option', { name: 'Veritone - Core' }));

    await user.click(screen.getByRole('button', { name: /save aeris - watchtower/i }));

    expect(updateAllocation).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ project_id: 'p3' }),
    );
  });

  it('asks for confirmation before deleting an allocation, and only calls removeAllocation once confirmed', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard([allocation({ project_name: 'Aeris - Watchtower' })]);

    await user.click(screen.getByRole('button', { name: /delete aeris - watchtower/i }));
    expect(await screen.findByText('Remove allocation?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Remove allocation?')).not.toBeInTheDocument();
    expect(removeAllocation).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /delete aeris - watchtower/i }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removeAllocation).toHaveBeenCalledWith('a1');
  });

  it('enables Review impact once a new project is added, independent of any existing allocation', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ value: 'acc1', label: 'Aeris' }],
      [
        {
          project_id: 'p2',
          account_id: 'acc1',
          name: 'Aeris - Finch Mobile',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
        },
      ],
    );

    expect(screen.getByRole('button', { name: /review impact/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
    // No project chosen yet — still gated.
    expect(screen.getByRole('button', { name: /review impact/i })).toBeDisabled();

    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris' }));
    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris - Finch Mobile' }));

    expect(screen.getByRole('button', { name: /review impact/i })).toBeEnabled();
  });

  it('requires both a start and end date on a new project before Review impact enables', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ value: 'acc1', label: 'Aeris' }],
      [
        {
          project_id: 'p2',
          account_id: 'acc1',
          name: 'Aeris - Finch Mobile',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
          can_manage: true,
        },
      ],
    );

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris' }));
    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris - Finch Mobile' }));

    // Dates default to today, so the row is valid out of the box.
    const startDate = screen.getByLabelText('Start date') as HTMLInputElement;
    const endDate = screen.getByLabelText('End date') as HTMLInputElement;
    expect(startDate.value).not.toBe('');
    expect(endDate.value).not.toBe('');
    expect(screen.getByRole('button', { name: /review impact/i })).toBeEnabled();

    // Clearing a required date (end) gates the button again.
    fireEvent.change(endDate, { target: { value: '' } });
    expect(screen.getByRole('button', { name: /review impact/i })).toBeDisabled();

    // Restoring a valid end date re-enables it.
    fireEvent.change(endDate, { target: { value: '2026-12-31' } });
    expect(screen.getByRole('button', { name: /review impact/i })).toBeEnabled();
  });

  it('warns in red and disables Review impact when a new project start is in the past', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ value: 'acc1', label: 'Aeris' }],
      [
        {
          project_id: 'p2',
          account_id: 'acc1',
          name: 'Aeris - Finch Mobile',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
          can_manage: true,
        },
      ],
    );

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris' }));
    await user.click(screen.getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris - Finch Mobile' }));

    // Defaults to today → valid.
    expect(screen.getByRole('button', { name: /review impact/i })).toBeEnabled();

    // Move the start into the past → red warning + gated button.
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: PAST_START } });
    expect(screen.getByText(/start date cannot be in the past/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review impact/i })).toBeDisabled();
  });

  it('warns and disables Save when an existing row start is edited into the past', () => {
    // Default allocation starts in the future, so its start is editable.
    renderWizard([allocation({ project_name: 'Aeris - Watchtower' })]);

    fireEvent.change(screen.getByLabelText('Start date for Aeris - Watchtower'), {
      target: { value: PAST_START },
    });

    expect(
      screen.getByText(/aeris - watchtower: start date cannot be in the past/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save aeris - watchtower/i })).toBeDisabled();
  });
});
