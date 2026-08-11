import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type ProjectListRow,
  previewReassignWorkerAllocations,
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
    previewReassignWorkerAllocations: vi.fn().mockResolvedValue({
      worker_name: 'Test Worker',
      sources: [],
      targets: [],
      peak_pct: 100,
      exceeds: false,
      peak_from: null,
      peak_to: null,
    }),
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

    // Dates default to today, so the row is valid out of the box.
    const startDate = screen.getByLabelText('Start date') as HTMLInputElement;
    const endDate = screen.getByLabelText('End date') as HTMLInputElement;
    expect(startDate.value).not.toBe('');
    expect(endDate.value).not.toBe('');
    expect(screen.getByRole('button', { name: /review impact/i })).toBeEnabled();

    // Clearing a required date (end) gates the button again. Astryx DateInput only commits a
    // cleared value on blur (onChange fires undefined then) — a bare `change` to '' just sets
    // in-progress text without touching the underlying value, unlike the native date input
    // this replaced where the change event alone updated `.value`.
    fireEvent.change(endDate, { target: { value: '' } });
    fireEvent.blur(endDate);
    expect(screen.getByRole('button', { name: /review impact/i })).toBeDisabled();

    // Restoring a valid end date re-enables it.
    fireEvent.change(endDate, { target: { value: '2026-12-31' } });
    expect(screen.getByRole('button', { name: /review impact/i })).toBeEnabled();
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
});
