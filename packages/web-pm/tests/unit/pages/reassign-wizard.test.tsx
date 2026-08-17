import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ProjectListRow,
  previewReassignWorkerAllocations,
  type RaMonitoringAllocation,
  reassignWorkerAllocations,
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
    reassignWorkerAllocations: vi
      .fn()
      .mockResolvedValue({ updated: [], target_ids: ['t1'], warnings: [] }),
    previewReassignWorkerAllocations: vi.fn().mockResolvedValue({
      worker_name: 'An Đình Luận',
      sources: [],
      targets: [],
      peak_pct: 100,
      exceeds: false,
      peak_from: null,
      peak_to: null,
    }),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

// Dates relative to the real "today" so the past/future distinction (FUT-349 lock) stays
// correct no matter when the suite runs.
const isoOffset = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const FUTURE_START = isoOffset(90);
const PAST_START = isoOffset(-90);
// A second future date, well after FUTURE_START, for tests that edit an end date and need
// the new value to stay >= date_from (Astryx DateInput enforces `min` on typed input, unlike
// the native <input type="date"> this replaced).
const NEW_END = isoOffset(150);

// Astryx DateInput (packages/shared-ui/src/primitives/date-input.tsx) renders a formatted
// text input (role="combobox"), not a native <input type="date"> — its DOM `.value` is a
// localized "Month D, YYYY" string, not the ISO value the component takes/emits. Mirror its
// internal formatting (DateInput -> plainDateToDate + DATE_FORMAT_LONG, both local-time based)
// so assertions on displayed text stay correct regardless of machine locale/timezone.
function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(year, month - 1, day));
}

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
  accountOptions: { id: string; label: string }[] = [],
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
    expect(endDateInput.value).toBe(formatLongDate('2026-12-23'));
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
    expect(endDateInput.value).toBe(formatLongDate('2027-01-01'));
  });

  it('calls updateAllocation with the full row patch on Save and displays the newly saved values', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard([allocation({ date_to: '2026-12-23', version: 3 })]);

    const endDateInput = screen.getByLabelText(/end date for/i) as HTMLInputElement;
    await user.clear(endDateInput);
    // Must land on or after date_from (FUTURE_START) — Astryx DateInput enforces the row's
    // `min` on typed input (unlike the native date input this replaced), silently rejecting
    // an out-of-range value instead of committing it.
    await user.type(endDateInput, NEW_END);

    const noteInput = screen.getByLabelText(/note for/i) as HTMLInputElement;
    await user.type(noteInput, 'Handover in progress');

    await user.click(screen.getByRole('button', { name: /save aeris - watchtower/i }));

    // Allocation is entered as the 0.3 fraction; the wizard converts it back to a percentage.
    expect(updateAllocation).toHaveBeenCalledWith('a1', {
      project_id: 'p1',
      planned_pct: 30,
      date_from: FUTURE_START,
      date_to: NEW_END,
      bucket: 'billable',
      note: 'Handover in progress',
      expected_version: 3,
    });
    // Row stays directly editable (no view-mode toggle) — its fields keep
    // reflecting exactly what was just saved.
    expect(endDateInput).toHaveValue(formatLongDate(NEW_END));
    expect(noteInput).toHaveValue('Handover in progress');
  });

  describe('unsaved existing-row edits travel with the preview (FUT-887)', () => {
    const PROJECTS: ProjectListRow[] = [
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
        project_id: 'p2',
        account_id: 'acc1',
        name: 'Aeris - Finch Mobile',
        phase: 'build',
        status: 'active',
        pm_worker_id: null,
        can_manage: true,
      },
    ];

    async function editEndDateThenReview(user: ReturnType<typeof userEvent.setup>) {
      renderWizard(
        [allocation({ date_to: '2026-12-23', version: 3 })],
        [{ id: 'acc1', label: 'Aeris' }],
        PROJECTS,
      );

      const dialog = screen.getByRole('dialog');

      const endDateInput = screen.getByLabelText(/end date for/i) as HTMLInputElement;
      await user.clear(endDateInput);
      await user.type(endDateInput, NEW_END);

      await user.click(within(dialog).getByRole('button', { name: 'Add project' }));
      await user.click(within(dialog).getByRole('combobox', { name: 'Account' }));
      await user.click(await screen.findByRole('option', { name: 'Aeris' }));
      await user.click(within(dialog).getByRole('combobox', { name: 'Project' }));
      await user.click(await screen.findByRole('option', { name: 'Aeris - Finch Mobile' }));

      await user.click(within(dialog).getByRole('button', { name: 'Review impact' }));
      return dialog;
    }

    const expectedEdit = () => ({
      allocation_id: 'a1',
      project_id: 'p1',
      planned_pct: 30,
      date_from: FUTURE_START,
      date_to: NEW_END,
      bucket: 'billable',
      note: null,
      expected_version: 3,
    });

    it('sends the edit to the preview instead of saving it', async () => {
      const user = userEvent.setup({ delay: null });
      await editEndDateThenReview(user);

      expect(updateAllocation).not.toHaveBeenCalled();
      expect(previewReassignWorkerAllocations).toHaveBeenCalledWith(
        expect.objectContaining({ existing_edits: [expectedEdit()] }),
      );
    });

    it('applies the edit only once Confirm is pressed', async () => {
      const user = userEvent.setup({ delay: null });
      const dialog = await editEndDateThenReview(user);

      await user.click(await within(dialog).findByRole('button', { name: 'Confirm' }));

      expect(updateAllocation).not.toHaveBeenCalled();
      expect(reassignWorkerAllocations).toHaveBeenCalledWith(
        expect.objectContaining({ existing_edits: [expectedEdit()] }),
      );
    });

    it('writes nothing when the review is closed instead of confirmed', async () => {
      const user = userEvent.setup({ delay: null });
      const dialog = await editEndDateThenReview(user);

      await user.click(await within(dialog).findByRole('button', { name: 'Back' }));

      expect(updateAllocation).not.toHaveBeenCalled();
      expect(reassignWorkerAllocations).not.toHaveBeenCalled();
    });
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
    // …but you can still shorten/extend it (FUT-876 disabled delete for past-start allocations).
    expect(screen.getByLabelText(/end date for/i)).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /delete aeris - watchtower/i })).toBeDisabled();
  });

  it('lets an existing row be moved to a different account/project, and sends the new project_id on Save', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23', version: 3 })],
      [
        { id: 'acc1', label: 'Aeris' },
        { id: 'acc2', label: 'Veritone' },
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

    // The existing-row Account/Project fields deliberately don't show entries on
    // bare focus (no `hasEntriesOnFocus`) — they're the Dialog's initial auto-focus
    // target, and that combination would silently pop the dropdown open the instant
    // the wizard mounts. Type to filter instead, same as a real user narrowing down.
    const accountField = screen.getByLabelText(/account for/i);
    await user.click(accountField);
    await user.clear(accountField);
    await user.type(accountField, 'Veritone');
    await user.click(await screen.findByRole('option', { name: 'Veritone' }));

    const projectField = screen.getByLabelText(/project for/i);
    await user.click(projectField);
    await user.clear(projectField);
    await user.type(projectField, 'Veritone - Core');
    await user.click(await screen.findByRole('option', { name: 'Veritone - Core' }));

    await user.click(screen.getByRole('button', { name: /save aeris - watchtower/i }));

    expect(updateAllocation).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ project_id: 'p3' }),
    );
  });

  // Astryx's AlertDialog always mounts its <dialog>, so the confirm step is asserted via the
  // alertdialog role entering/leaving the accessibility tree rather than by page text — its title
  // stays in the DOM while closed, and the surrounding wizard Dialog has its own Cancel button.
  it('asks for confirmation before deleting an allocation, and only calls removeAllocation once confirmed', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard([allocation({ project_name: 'Aeris - Watchtower' })]);

    await user.click(screen.getByRole('button', { name: /delete aeris - watchtower/i }));
    const confirm = await screen.findByRole('alertdialog');
    expect(
      within(confirm).getByRole('heading', { name: 'Remove allocation?' }),
    ).toBeInTheDocument();
    expect(
      within(confirm).getByText(/This removes An Đình Luận from Aeris - Watchtower\./),
    ).toBeInTheDocument();

    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(removeAllocation).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /delete aeris - watchtower/i }));
    const reopened = await screen.findByRole('alertdialog');
    await user.click(within(reopened).getByRole('button', { name: 'Remove' }));
    expect(removeAllocation).toHaveBeenCalledWith('a1');
  });

  it('enables Review impact once a new project is added, independent of any existing allocation', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ id: 'acc1', label: 'Aeris' }],
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

  it('carries a note typed on a new project row through to the preview and the confirmed write', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ id: 'acc1', label: 'Aeris' }],
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
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Add project' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris - Finch Mobile' }));

    await user.type(within(dialog).getByLabelText('Note'), 'Backfill for Q3 ramp');

    await user.click(within(dialog).getByRole('button', { name: 'Review impact' }));

    expect(previewReassignWorkerAllocations).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [expect.objectContaining({ project_id: 'p2', note: 'Backfill for Q3 ramp' })],
      }),
    );

    await user.click(await within(dialog).findByRole('button', { name: 'Confirm' }));

    expect(reassignWorkerAllocations).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [expect.objectContaining({ project_id: 'p2', note: 'Backfill for Q3 ramp' })],
      }),
    );
  });

  it('sends no note when the new project row leaves it empty', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ id: 'acc1', label: 'Aeris' }],
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
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Add project' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris - Finch Mobile' }));
    await user.click(within(dialog).getByRole('button', { name: 'Review impact' }));

    expect(previewReassignWorkerAllocations).toHaveBeenCalledWith(
      expect.objectContaining({ targets: [expect.objectContaining({ note: null })] }),
    );
  });

  it('removes the last remaining new allocation row, collapsing the table back to none', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard([allocation({ date_to: '2026-12-23' })], [{ id: 'acc1', label: 'Aeris' }]);

    await user.click(screen.getByRole('button', { name: 'Add project' }));
    expect(screen.getByLabelText('Account')).toBeInTheDocument();

    const removeRow = screen.getByRole('button', { name: 'Remove' });
    expect(removeRow).toBeEnabled();

    await user.click(removeRow);

    expect(screen.queryByLabelText('Account')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review impact/i })).toBeDisabled();
  });

  it('does not offer 0 as a selectable allocation on a new project (a 0% allocation is invalid)', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ id: 'acc1', label: 'Aeris' }],
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

    // Open the new project row's Allocation dropdown. 0 is not a valid allocation
    // (FUT-846), so it must not be offered as an option.
    await user.click(screen.getByRole('combobox', { name: 'Allocation' }));

    expect(screen.queryByRole('option', { name: '0' })).not.toBeInTheDocument();
    // 0.1 remains the smallest valid step.
    expect(await screen.findByRole('option', { name: '0.1' })).toBeInTheDocument();
  });

  it('requires both a start and end date on a new project, displays required indicators, validation errors, and gates Review impact', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ id: 'acc1', label: 'Aeris' }],
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

    // Start date and End date column headers in the target table are marked with required asterisk (*).
    const targetStartDateHeader = screen
      .getAllByText('Start date')
      .find((el) => el.parentElement?.textContent?.includes('*'));
    expect(targetStartDateHeader).toBeDefined();

    const targetEndDateHeader = screen
      .getAllByText('End date')
      .find((el) => el.parentElement?.textContent?.includes('*'));
    expect(targetEndDateHeader).toBeDefined();

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

    // Clearing a required date (end) gates the button again and shows validation error message.
    fireEvent.change(endDate, { target: { value: '' } });
    fireEvent.blur(endDate);
    expect(screen.getByRole('button', { name: /review impact/i })).toBeDisabled();
    expect(screen.getAllByText('End date is required.').length).toBeGreaterThanOrEqual(1);

    // Restoring a valid end date re-enables it and clears the message.
    fireEvent.change(endDate, { target: { value: '2026-12-31' } });
    expect(screen.getByRole('button', { name: /review impact/i })).toBeEnabled();
    expect(screen.queryByText('End date is required.')).not.toBeInTheDocument();

    // Clearing start date shows start date required error and gates button.
    fireEvent.change(startDate, { target: { value: '' } });
    fireEvent.blur(startDate);
    expect(screen.getByRole('button', { name: /review impact/i })).toBeDisabled();
    expect(screen.getAllByText('Start date is required.').length).toBeGreaterThanOrEqual(1);
  });

  // Astryx's DateInput enforces `min` on typed input as well as in the picker: a date
  // before `min` never reaches onChange, and blur reverts the field. So a past start is
  // now prevented rather than flagged — the pastStart validator that used to surface it
  // is covered directly in target-allocation-errors.test.ts.
  it('refuses a past start typed into a new project row', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ id: 'acc1', label: 'Aeris' }],
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

    const startDate = screen.getByLabelText('Start date');
    const beforeEdit = (startDate as HTMLInputElement).value;

    fireEvent.change(startDate, { target: { value: PAST_START } });
    fireEvent.blur(startDate);

    expect((startDate as HTMLInputElement).value).toBe(beforeEdit);
    expect(screen.queryByText(/start date cannot be in the past/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /review impact/i })).toBeEnabled();
  });

  it('refuses a past start typed into an existing row', () => {
    // Default allocation starts in the future, so its start is editable.
    renderWizard([allocation({ project_name: 'Aeris - Watchtower' })]);

    const startDate = screen.getByLabelText('Start date for Aeris - Watchtower');
    const beforeEdit = (startDate as HTMLInputElement).value;

    fireEvent.change(startDate, { target: { value: PAST_START } });
    fireEvent.blur(startDate);

    expect((startDate as HTMLInputElement).value).toBe(beforeEdit);
    expect(
      screen.queryByText(/aeris - watchtower: start date cannot be in the past/i),
    ).not.toBeInTheDocument();
  });

  // Occlusion smoke test (plan Task 2 Step 5): the wizard is now an Astryx `Dialog` rendered
  // via the native <dialog> element (top-layer). It's the most float-dense migrated dialog in
  // this plan — every allocation row has 2 Typeahead comboboxes — so this proves a float still
  // opens and its options are reachable when hosted inside the new modal, not clipped by
  // `LayoutContent`'s own scroll container regardless of how deep the row grid nests it.
  it('occlusion: the "Add project" row Typeahead opens and its options are reachable inside the modal', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ id: 'acc1', label: 'Aeris' }],
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

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'An Đình Luận' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Add project' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Account' }));

    // The popover shim renders the popup content, but it isn't necessarily a DOM descendant
    // of the <dialog> element, so assert against the document rather than `within(dialog)`.
    expect(await screen.findByRole('option', { name: 'Aeris' })).toBeInTheDocument();
  });

  it('displays restricted allocations warning notice and restricted timeline row on Review Impact step', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(previewReassignWorkerAllocations).mockResolvedValue({
      worker_name: 'An Đình Luận',
      sources: [],
      targets: [
        {
          project_name: 'Aeris - Finch Mobile',
          account_name: 'Aeris',
          bucket: 'billable',
          date_from: FUTURE_START,
          date_to: NEW_END,
          planned_pct: 100,
        },
      ],
      peak_pct: 270,
      exceeds: true,
      peak_from: FUTURE_START,
      peak_to: NEW_END,
      has_restricted_allocations: true,
      restricted_segments: [
        {
          date_from: FUTURE_START,
          date_to: NEW_END,
          planned_pct: 170,
        },
      ],
    });

    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ id: 'acc1', label: 'Aeris' }],
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

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add project' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Aeris - Finch Mobile' }));

    await user.click(within(dialog).getByRole('button', { name: 'Review impact' }));

    expect(
      await screen.findByText((content) => content.includes('restricted projects are included')),
    ).toBeInTheDocument();
    expect(screen.getByText('Restricted projects')).toBeInTheDocument();
    expect(screen.getAllByText('270%').length).toBeGreaterThan(0);
  });

  it('displays warnings for all over-allocation periods when multiple exist (FUT-885)', async () => {
    const user = userEvent.setup({ delay: null });
    vi.mocked(previewReassignWorkerAllocations).mockResolvedValue({
      worker_name: 'Phan Văn Hưng',
      sources: [],
      targets: [
        {
          project_name: 'Motion Global',
          account_name: 'Motion Global',
          bucket: 'billable',
          date_from: '2026-09-24',
          date_to: '2026-09-30',
          planned_pct: 100,
        },
        {
          project_name: 'Teacher Zone',
          account_name: 'Teacher Zone',
          bucket: 'billable',
          date_from: '2026-11-01',
          date_to: '2026-11-30',
          planned_pct: 100,
        },
      ],
      peak_pct: 200,
      exceeds: true,
      peak_from: '2026-09-24',
      peak_to: '2026-09-30',
      over_allocation_periods: [
        { date_from: '2026-09-24', date_to: '2026-09-30', peak_pct: 200 },
        { date_from: '2026-11-01', date_to: '2026-11-30', peak_pct: 200 },
      ],
      has_restricted_allocations: false,
      restricted_segments: [],
    });

    renderWizard(
      [allocation({ date_from: FUTURE_START, date_to: '2026-12-31' })],
      [{ id: 'acc1', label: 'Motion Global' }],
      [
        {
          project_id: 'p2',
          account_id: 'acc1',
          name: 'Motion Global',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
          can_manage: true,
        },
      ],
    );

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Add project' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Account' }));
    await user.click(await screen.findByRole('option', { name: 'Motion Global' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Project' }));
    await user.click(await screen.findByRole('option', { name: 'Motion Global' }));

    await user.click(within(dialog).getByRole('button', { name: 'Review impact' }));

    expect(await screen.findAllByText(/24 Sep 2026/)).not.toHaveLength(0);
    expect(screen.getAllByText(/30 Sep 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/01 Nov 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/30 Nov 2026/).length).toBeGreaterThan(0);
  });

  it('FUT-852: displays target allocation in AllocationTimeline with error styling when preview fails', async () => {
    const user = userEvent.setup({ delay: null });
    const { previewReassignWorkerAllocations } = await import('../../../src/api/pm-client.ts');
    vi.mocked(previewReassignWorkerAllocations).mockRejectedValueOnce(
      new Error('AV1A: Allocation end 2026-12-31 is after the project end 2026-06-30'),
    );

    renderWizard(
      [allocation({ date_to: '2026-12-23' })],
      [{ id: 'acc1', label: 'Aeris' }],
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

    await user.click(screen.getByRole('button', { name: /review impact/i }));

    expect(
      await screen.findByText(
        /AV1A: Allocation end 2026-12-31 is after the project end 2026-06-30/,
      ),
    ).toBeInTheDocument();

    // AllocationTimeline renders target allocation project name even though preview dry-run failed
    const targetLabel = screen.getByText('Aeris - Finch Mobile');
    expect(targetLabel).toBeInTheDocument();
    expect(targetLabel).toHaveClass('text-error');
  });

  // FUT-847: the existing-row overlap error prefixes the *current* project name from the draft,
  // not the original DB value. After editing row a2 (Project Beta) to overlap row a1 on the same
  // project, both messages must reference the new project only.
  it('FUT-847: shows the edited project name in the overlap validation message', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [
        // a1 and a2 overlap fully in time but live on different projects — no overlap today.
        allocation({ allocation_id: 'a1', project_id: 'p1', project_name: 'Project Alpha' }),
        allocation({
          allocation_id: 'a2',
          project_id: 'p2',
          project_name: 'Project Beta',
          planned_pct: 40,
        }),
      ],
      [{ id: 'acc1', label: 'Aeris' }],
      [
        {
          project_id: 'p1',
          account_id: 'acc1',
          name: 'Project Alpha',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
          can_manage: true,
          can_report: true,
        },
        {
          project_id: 'p2',
          account_id: 'acc1',
          name: 'Project Beta',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
          can_manage: true,
          can_report: true,
        },
      ],
    );

    // Move a2 from Project Beta → Project Alpha so the two now overlap on one project.
    const projectField = screen.getByLabelText(/project for project beta/i);
    await user.click(projectField);
    await user.clear(projectField);
    await user.type(projectField, 'Project Alpha');
    await user.click(await screen.findByRole('option', { name: 'Project Alpha' }));

    // Both rows now overlap on Project Alpha — messages are deduplicated so exactly one
    // unified overlap error message is shown referencing the edited project name.
    const overlaps = screen
      .getAllByRole('alert')
      .filter((el) => el.textContent?.includes('Overlaps another allocation'));
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toHaveTextContent(
      'Project Alpha: Overlaps another allocation on this project.',
    );
    expect(overlaps[0]).not.toHaveTextContent('Project Beta');
  });

  // FUT-847: the overlap message must also clear (not linger from saved values) once the edit
  // resolves the overlap — display tracks the draft, not the DB.
  it('FUT-847: clears the overlap message when the edit resolves the overlap', async () => {
    const user = userEvent.setup({ delay: null });
    renderWizard(
      [
        allocation({ allocation_id: 'a1', project_id: 'p1', project_name: 'Project Alpha' }),
        allocation({
          allocation_id: 'a2',
          project_id: 'p2',
          project_name: 'Project Beta',
          planned_pct: 40,
        }),
      ],
      [{ id: 'acc1', label: 'Aeris' }],
      [
        {
          project_id: 'p1',
          account_id: 'acc1',
          name: 'Project Alpha',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
          can_manage: true,
          can_report: true,
        },
        {
          project_id: 'p2',
          account_id: 'acc1',
          name: 'Project Beta',
          phase: 'build',
          status: 'active',
          pm_worker_id: null,
          can_manage: true,
          can_report: true,
        },
      ],
    );

    // a2 → Project Alpha first creates an overlap; a single deduplicated message appears.
    const projectField = screen.getByLabelText(/project for project beta/i);
    await user.click(projectField);
    await user.clear(projectField);
    await user.type(projectField, 'Project Alpha');
    await user.click(await screen.findByRole('option', { name: 'Project Alpha' }));
    const overlaps = screen
      .getAllByRole('alert')
      .filter((el) => el.textContent?.includes('Overlaps another allocation'));
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).not.toHaveTextContent('Project Beta');

    // Now set a1 to a non-overlapping window — the overlap (and the message) must clear.
    const a1Start = screen.getByLabelText(/start date for project alpha/i);
    await user.click(a1Start);
    await user.clear(a1Start);
    await user.type(a1Start, formatLongDate(isoOffset(200)));
    const after = screen
      .getAllByRole('alert')
      .filter((el) => el.textContent?.includes('Overlaps another allocation'));
    expect(after).toHaveLength(0);
  });

  describe('note field', () => {
    const OVER_CAP = 'Washington DC and Northern Virginia coverage. '.repeat(9);
    const sleepPastTooltipDelay = () => new Promise((resolve) => setTimeout(resolve, 400));

    it('caps an existing row note at 200 characters', () => {
      renderWizard([allocation()]);
      const noteInput = screen.getByLabelText(/note for/i) as HTMLInputElement;

      fireEvent.change(noteInput, { target: { value: OVER_CAP } });

      expect(noteInput.value).toBe(OVER_CAP.slice(0, 200));
    });

    it('caps a new project row note at 200 characters', async () => {
      const user = userEvent.setup({ delay: null });
      renderWizard([allocation({ date_to: '2026-12-23' })], [{ id: 'acc1', label: 'Aeris' }]);

      await user.click(screen.getByRole('button', { name: 'Add project' }));
      const noteInput = screen.getByLabelText('Note') as HTMLInputElement;

      fireEvent.change(noteInput, { target: { value: OVER_CAP } });

      expect(noteInput.value).toBe(OVER_CAP.slice(0, 200));
    });

    it('keeps a stored note that already exceeds the cap, blocking only further growth', () => {
      const legacy = 'x'.repeat(260);
      renderWizard([allocation({ note: legacy })]);
      const noteInput = screen.getByLabelText(/note for/i) as HTMLInputElement;
      expect(noteInput.value).toBe(legacy);

      fireEvent.change(noteInput, { target: { value: `${legacy}y` } });
      expect(noteInput.value).toBe(legacy);

      fireEvent.change(noteInput, { target: { value: legacy.slice(0, 40) } });
      expect(noteInput.value).toBe(legacy.slice(0, 40));
    });

    it('flags the field as full at the cap and clears the flag once room is made', () => {
      renderWizard([allocation()]);
      const noteInput = screen.getByLabelText(/note for/i) as HTMLInputElement;

      fireEvent.change(noteInput, { target: { value: 'x'.repeat(200) } });
      expect(noteInput.closest('.astryx-text-input')).toHaveAttribute('data-status', 'warning');

      fireEvent.change(noteInput, { target: { value: 'x'.repeat(199) } });
      expect(noteInput.closest('.astryx-text-input')).not.toHaveAttribute('data-status', 'warning');
    });

    it('tells the user when a pasted note gets trimmed', async () => {
      renderWizard([allocation()]);
      const noteInput = screen.getByLabelText(/note for/i) as HTMLInputElement;

      fireEvent.change(noteInput, { target: { value: OVER_CAP } });

      // The toast viewport and Astryx's live region both carry the message, and both sit
      // outside the RTL container (so they survive cleanup between tests) — assert on the
      // message appearing at all, and elsewhere on it not appearing anew.
      expect(await screen.findAllByText('Note trimmed to 200 characters.')).not.toHaveLength(0);
    });

    it('stays quiet when a single keystroke is refused at the cap', () => {
      const full = 'x'.repeat(200);
      renderWizard([allocation({ note: full })]);
      const noteInput = screen.getByLabelText(/note for/i) as HTMLInputElement;
      const before = screen.queryAllByText(/trimmed to 200 characters/i).length;

      fireEvent.change(noteInput, { target: { value: `${full}y` } });

      expect(screen.queryAllByText(/trimmed to 200 characters/i).length).toBeLessThanOrEqual(
        before,
      );
    });

    it('explains the limit in the hover tooltip once the note is full', async () => {
      const user = userEvent.setup({ delay: null });
      renderWizard([allocation({ note: 'x'.repeat(200) })]);

      await user.hover(screen.getByLabelText(/note for/i));

      expect(await screen.findByRole('tooltip')).toHaveTextContent('Full — 200 characters max.');
    });

    it('reveals the full note on hover, and stays quiet while there is none to read', async () => {
      const user = userEvent.setup({ delay: null });
      renderWizard([allocation({ note: null })]);
      const noteInput = screen.getByLabelText(/note for/i) as HTMLInputElement;

      await user.hover(noteInput);
      await sleepPastTooltipDelay();
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

      await user.unhover(noteInput);
      const note = 'Washington DC and Northern Virginia coverage through the handover.';
      fireEvent.change(noteInput, { target: { value: note } });
      await user.hover(noteInput);

      expect(await screen.findByRole('tooltip')).toHaveTextContent(note);
    });
  });
});
