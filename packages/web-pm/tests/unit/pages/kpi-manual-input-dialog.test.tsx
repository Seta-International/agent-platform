import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KpiRecordDetail, KpiRecordMetricRow } from '../../../src/api/pm-client.ts';
import { KpiManualInputDialog } from '../../../src/pages/kpi-manual-input-dialog.tsx';

const fetchKpiRecordMock = vi.fn();
const upsertKpiRecordMock = vi.fn();
vi.mock('../../../src/api/pm-client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/api/pm-client.ts')>();
  return {
    ...actual,
    fetchKpiRecord: () => fetchKpiRecordMock(),
    upsertKpiRecord: (body: unknown) => upsertKpiRecordMock(body),
  };
});

const base: KpiRecordMetricRow = {
  metric_id: 'm-leakage',
  category: 'quality',
  tier: 'core',
  name: 'Defect Leakage',
  formula_label: 'Production defects / Total defects',
  component_count: 2,
  component_1_label: 'Production defects',
  component_2_label: 'Total defects',
  component_1_integer: true,
  component_2_integer: true,
  component_1_min: 0,
  component_1_max: null,
  is_share: true,
  green_band: { op: 'lte', value: 0.05 },
  yellow_band: { op: 'between', min: 0.05, max: 0.1 },
  red_band: { op: 'gt', value: 0.1 },
  insight: null,
  component_1_value: null,
  component_2_value: null,
  computed_value: null,
  status: null,
};

const hoursRatio: KpiRecordMetricRow = {
  ...base,
  metric_id: 'm-util',
  category: 'cost_capacity',
  name: 'Utilization Rate',
  formula_label: 'Worked hours / Available hours',
  component_1_label: 'Worked hours',
  component_2_label: 'Available hours',
  component_1_integer: false,
  component_2_integer: false,
  is_share: false,
  green_band: { op: 'between', min: 0.75, max: 0.9 },
  yellow_band: { op: 'between', min: 0.6, max: 0.74 },
  red_band: { op: 'lt', value: 0.6 },
};

const leadTime: KpiRecordMetricRow = {
  ...base,
  metric_id: 'm-risk-lead',
  category: 'process',
  name: 'Risk Identification Lead Time',
  formula_label: 'Risk occurrence → register entry',
  component_count: 1,
  component_1_label: 'Days occurrence → register entry',
  component_2_label: null,
  component_1_integer: true,
  component_2_integer: false,
  component_1_min: -49,
  component_1_max: 49,
  is_share: false,
  green_band: { op: 'lt', value: 0 },
  yellow_band: { op: 'between', min: 0, max: 7 },
  red_band: { op: 'gt', value: 7 },
};

const record: KpiRecordDetail = {
  record_id: null,
  project_id: 'p-1',
  iso_year: 2026,
  iso_week: 32,
  version: null,
  metrics: [base, hoursRatio, leadTime],
  category_health: {
    quality: 'green',
    cost_capacity: 'green',
    delivery: 'green',
    process: 'green',
  },
  overall_health: 'green',
};

function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <KpiManualInputDialog
          initial={{ project_id: 'p-1', iso_year: 2026, iso_week: 32 }}
          projects={[
            { value: 'p-1', label: 'Acme Analytics Hub' },
            { value: 'p-2', label: 'Acme Billing Revamp' },
          ]}
          weeks={[{ iso_year: 2026, iso_week: 32, label: '2026-W32 (current)' }]}
          onOpenChange={vi.fn()}
        />
      </QueryClientProvider>,
    ),
  };
}

function messageUnder(input: HTMLElement): string | null {
  for (const id of (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)) {
    const el = document.getElementById(id);
    if (el?.getAttribute('role') === 'alert') return el.textContent;
  }
  return null;
}

const box = (name: string) => screen.getByRole('spinbutton', { name });
const saveButton = () => screen.getByRole('button', { name: /Save record/i });

function pasteEvent(text: string) {
  const e = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { getData: () => text } });
  return e;
}

describe('KpiManualInputDialog — entry validation', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-03T02:00:00Z').getTime());
    fetchKpiRecordMock.mockResolvedValue(record);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchKpiRecordMock.mockReset();
    upsertKpiRecordMock.mockReset();
  });

  it('takes a five-figure count — no arbitrary ceiling', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '12000');
    await user.type(box('Total defects'), '90000');

    expect(messageUnder(numerator)).toBeNull();
    expect(saveButton()).toBeEnabled();
  });

  it('refuses a figure wider than the column can store', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '123456789012');

    expect(messageUnder(numerator)).toBe('Max 11 digits');
    await user.click(saveButton());
    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
  });

  it('refuses a decimal where the metric counts things, but allows one where it measures', async () => {
    const user = userEvent.setup();
    renderDialog();

    const defects = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(defects, '2.6');
    expect(messageUnder(defects)).toBe('Whole number only');

    const hours = box('Worked hours');
    await user.type(hours, '37.5');
    expect(messageUnder(hours)).toBeNull();
  });

  it('accepts a decimal pasted with the comma a VN-locale box displays', async () => {
    renderDialog();

    const hours = await screen.findByRole('spinbutton', { name: 'Worked hours' });
    const paste = pasteEvent('0,6');
    hours.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(false);
  });

  it('still blocks a paste that is not a figure at all', async () => {
    renderDialog();

    const hours = await screen.findByRole('spinbutton', { name: 'Worked hours' });
    const paste = pasteEvent('37h30');
    hours.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(true);
  });

  it('refuses a negative count and says why, instead of dropping the keystroke', async () => {
    const user = userEvent.setup();
    renderDialog();

    const defects = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(defects, '-3');

    expect(messageUnder(defects)).toBe("Can't be negative");
  });

  it('marks the other box required once one of a pair is filled', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '5');

    expect(messageUnder(box('Total defects'))).toBe('Required');
    await user.click(saveButton());
    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
  });

  it('refuses a zero denominator', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '5');
    const denominator = box('Total defects');
    await user.type(denominator, '0');

    expect(messageUnder(denominator)).toBe("Can't be 0");
  });

  it('caps a share metric at its total but lets a rate metric run past 100%', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '21');
    await user.type(box('Total defects'), '20');
    expect(messageUnder(numerator)).toBe("Can't exceed Total defects");

    const worked = box('Worked hours');
    await user.type(worked, '45');
    await user.type(box('Available hours'), '40');
    expect(messageUnder(worked)).toBeNull();
  });

  it('keeps a numerator the reporter is about to justify by raising the total', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '20');
    await user.type(box('Total defects'), '20');

    await user.clear(numerator);
    await user.type(numerator, '60');
    expect(messageUnder(numerator)).toBe("Can't exceed Total defects");

    await user.tab();
    expect(numerator).toHaveValue(60);
    expect(messageUnder(numerator)).toBe("Can't exceed Total defects");
    await user.click(saveButton());
    expect(upsertKpiRecordMock).not.toHaveBeenCalled();

    await user.clear(box('Total defects'));
    await user.type(box('Total defects'), '200');
    expect(messageUnder(numerator)).toBeNull();
    expect(saveButton()).toBeEnabled();
  });

  it('takes a negative lead time and warns only outside its range', async () => {
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('spinbutton', {
      name: 'Days occurrence → register entry',
    });
    await user.type(days, '-12');
    expect(days).toHaveValue(-12);
    expect(messageUnder(days)).toBeNull();

    await user.clear(days);
    await user.type(days, '-50');
    expect(messageUnder(days)).toBe('Enter -49 to 49');
  });

  it('leaves an out-of-range figure on screen with its error when the box loses focus', async () => {
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('spinbutton', {
      name: 'Days occurrence → register entry',
    });
    await user.type(days, '12');
    await user.tab();
    expect(days).toHaveValue(12);

    await user.clear(days);
    await user.type(days, '1200');
    await user.tab();

    expect(days).toHaveValue(1200);
    expect(messageUnder(days)).toBe('Enter -49 to 49');
  });

  it('keeps the out-of-range figure the reporter typed over the one already saved', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 3,
      metrics: [base, hoursRatio, { ...leadTime, component_1_value: 7 }],
    });
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('spinbutton', {
      name: 'Days occurrence → register entry',
    });
    await user.clear(days);
    await user.type(days, '1000');
    await user.tab();

    expect(days).toHaveValue(1000);
    expect(messageUnder(days)).toBe('Enter -49 to 49');
  });

  it('counts a blurred per-box error alongside a cross-field one', async () => {
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('spinbutton', {
      name: 'Days occurrence → register entry',
    });
    await user.type(days, '1200');
    await user.tab();
    await user.type(box('Production defects'), '5');

    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(screen.getByText('2 figures need fixing')).toBeInTheDocument();
    expect(box('Total defects')).toHaveFocus();
  });

  it('takes a saved figure back to not-measured when the box is emptied', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 3,
      metrics: [base, hoursRatio, { ...leadTime, component_1_value: 7 }],
    });
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('spinbutton', {
      name: 'Days occurrence → register entry',
    });
    await user.clear(days);
    await user.tab();

    expect(days).toHaveValue(null);
  });

  it('saves an emptied metric as not measured', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 3,
      metrics: [
        { ...base, component_1_value: 1, component_2_value: 20 },
        hoursRatio,
        { ...leadTime, component_1_value: 7 },
      ],
    });
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('spinbutton', {
      name: 'Days occurrence → register entry',
    });
    await user.clear(days);
    await user.tab();
    await user.click(saveButton());

    expect(upsertKpiRecordMock).toHaveBeenCalledOnce();
    const body = upsertKpiRecordMock.mock.calls[0][0] as {
      entries: { metric_id: string; component_1_value: number | null }[];
    };
    expect(body.entries.find((e) => e.metric_id === 'm-risk-lead')?.component_1_value).toBeNull();
  });

  it('confirms the save to the reporter', async () => {
    upsertKpiRecordMock.mockResolvedValue({ record_id: 'rec-1', version: 4 });
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');

    const confirmations = () => screen.queryAllByText('KPI record saved').length;
    const before = confirmations();
    await user.click(saveButton());

    await waitFor(() => expect(confirmations()).toBe(before + 1));
  });

  it('tells the reporter when someone else saved the record first', async () => {
    upsertKpiRecordMock.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }));
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');
    await user.click(saveButton());

    expect(
      await screen.findByText('Someone saved this record first — reloaded the latest values.'),
    ).toBeInTheDocument();
  });

  it('replaces the on-screen figures with the winning ones after a conflict', async () => {
    upsertKpiRecordMock.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }));
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');

    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 2,
      metrics: [{ ...base, component_1_value: 3, component_2_value: 40 }, hoursRatio, leadTime],
    });
    await user.click(saveButton());

    await waitFor(() => expect(box('Production defects')).toHaveValue(3));
    expect(box('Total defects')).toHaveValue(40);
  });

  it('previews a colour for a ratio that falls between two band thresholds', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      metrics: [{ ...base, yellow_band: { op: 'between', min: 0.06, max: 0.1 } }],
    });
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '17');

    expect(screen.getAllByText('Amber').length).toBeGreaterThan(0);
  });

  it('withholds the RAG badge while a figure is out of range', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');
    expect(screen.getAllByText('Green').length).toBeGreaterThan(0);

    await user.clear(box('Total defects'));
    await user.type(box('Total defects'), '0');

    expect(screen.queryByText('Green')).not.toBeInTheDocument();
  });

  it('claims the week held no record yet, so a racing first save cannot be overwritten', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');
    await user.click(saveButton());

    const body = upsertKpiRecordMock.mock.calls[0][0] as { expected_version: number | null };
    expect(body.expected_version).toBeNull();
  });

  it('keeps figures being typed when the record is refetched underneath', async () => {
    const user = userEvent.setup();
    const { qc } = renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '7');
    await user.tab();
    expect(numerator).toHaveValue(7);

    expect(screen.getByText('New record')).toBeInTheDocument();
    fetchKpiRecordMock.mockResolvedValue({ ...record, record_id: 'rec-1', version: 2 });
    await qc.refetchQueries();
    await waitFor(() => expect(screen.queryByText('New record')).not.toBeInTheDocument());

    expect(numerator).toHaveValue(7);
  });

  it('brings back figures typed before switching to another project', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '7');

    await user.click(screen.getByRole('combobox', { name: /^Project/ }));
    await user.click(await screen.findByRole('option', { name: 'Acme Billing Revamp' }));
    await waitFor(() => expect(box('Production defects')).toHaveValue(null));

    await user.click(screen.getByRole('combobox', { name: /^Project/ }));
    await user.click(await screen.findByRole('option', { name: 'Acme Analytics Hub' }));

    await waitFor(() => expect(box('Production defects')).toHaveValue(7));
  });

  it('does not let the scroll wheel change a focused figure', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '4');
    expect(numerator).toHaveFocus();

    numerator.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));

    expect(numerator).not.toHaveFocus();
    expect(numerator).toHaveValue(4);
  });

  it('jumps to the figure that needs fixing instead of leaving Save inert', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '21');
    await user.type(box('Total defects'), '20');
    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(numerator).toHaveFocus();
    expect(screen.getByText('1 figure needs fixing')).toBeInTheDocument();
  });

  it('counts every unfixed figure and jumps to the first one in reading order', async () => {
    const user = userEvent.setup();
    renderDialog();

    const worked = await screen.findByRole('spinbutton', { name: 'Worked hours' });
    await user.type(worked, '45');
    await user.type(box('Production defects'), '5');

    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(screen.getByText('2 figures need fixing')).toBeInTheDocument();
    expect(box('Total defects')).toHaveFocus();
  });

  it('says the record is still empty rather than a Save that does nothing', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(screen.getByText('Enter at least one figure to save')).toBeInTheDocument();
    expect(box('Production defects')).toHaveFocus();
  });

  it('drops the blocking message once the figures are in range', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.click(saveButton());
    expect(screen.getByText('Enter at least one figure to save')).toBeInTheDocument();

    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');

    expect(screen.queryByText(/needs? fixing/)).not.toBeInTheDocument();
    expect(screen.queryByText('Enter at least one figure to save')).not.toBeInTheDocument();
  });

  it('saves once every figure is in range', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('spinbutton', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');
    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());
    expect(upsertKpiRecordMock).toHaveBeenCalledOnce();
  });
});
