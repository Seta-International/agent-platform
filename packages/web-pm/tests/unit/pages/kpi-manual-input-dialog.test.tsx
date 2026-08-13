import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KpiRecordDetail, KpiRecordMetricRow } from '../../../src/api/pm-client.ts';
import {
  KpiManualInputDialog,
  parseNumericPaste,
} from '../../../src/pages/kpi-manual-input-dialog.tsx';

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

const reopened: KpiRecordMetricRow = {
  ...base,
  metric_id: 'm-reopened',
  category: 'quality',
  name: 'Reopened Defect Rate',
  formula_label: 'Reopened defects / Total defects closed',
  component_1_label: 'Reopened defects',
  component_2_label: 'Total defects closed',
  green_band: { op: 'lte', value: 0.05 },
  yellow_band: { op: 'between', min: 0.05, max: 0.15 },
  red_band: { op: 'gt', value: 0.15 },
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
  const onOpenChange = vi.fn();
  return {
    qc,
    onOpenChange,
    ...render(
      <QueryClientProvider client={qc}>
        <KpiManualInputDialog
          initial={{ project_id: 'p-1', iso_year: 2026, iso_week: 32 }}
          projects={[
            { value: 'p-1', label: 'Acme Analytics Hub' },
            { value: 'p-2', label: 'Acme Billing Revamp' },
          ]}
          weeks={[{ iso_year: 2026, iso_week: 32, label: '2026-W32 (current)' }]}
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    ),
  };
}

function messageUnder(input: HTMLElement): string | null {
  for (const id of (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)) {
    const el = document.getElementById(id);
    if (el?.getAttribute('data-type') === 'error') return el.textContent;
  }
  return null;
}

const box = (name: string) => screen.getByRole('textbox', { name });
const saveButton = () => screen.getByRole('button', { name: /Save record/i });
const cancelButton = () => screen.getByRole('button', { name: 'Cancel' });
const discardPrompt = () =>
  document.querySelector<HTMLDialogElement>('dialog[role="alertdialog"][open]');
const headerBadges = () =>
  screen.getByRole('button', { name: /close/i }).parentElement as HTMLElement;
const pillarFlag = (label: string) =>
  within(screen.getByRole('heading', { name: label }).parentElement as HTMLElement);

function speaksLocale(tag: string) {
  Object.defineProperty(navigator, 'language', { value: tag, configurable: true });
}

const greyBlock = (n: number) =>
  `${n} ${n === 1 ? 'metric is' : 'metrics are'} still Grey — every metric needs its figures to save`;

async function fillEveryMetric(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByRole('textbox', { name: 'Production defects' }), '1');
  await user.type(box('Total defects'), '20');
  await user.type(box('Worked hours'), '8');
  await user.type(box('Available hours'), '10');
  await user.type(box('Days occurrence → register entry'), '-1');
}

describe('parseNumericPaste — reads the figure out of the separators it was written with', () => {
  const vi = 'vi-VN';
  const en = 'en-US';

  it('reads a lone separator with other than three digits behind it as a decimal point', () => {
    expect(parseNumericPaste('12.5', vi)).toBe(12.5);
    expect(parseNumericPaste('0.05', vi)).toBe(0.05);
    expect(parseNumericPaste('12.3456', vi)).toBe(12.3456);
    expect(parseNumericPaste('12,5', vi)).toBe(12.5);
    expect(parseNumericPaste('12,5', en)).toBe(12.5);
  });

  it('reads a repeated separator as grouping, whichever mark the writer used', () => {
    expect(parseNumericPaste('1.234.567', vi)).toBe(1234567);
    expect(parseNumericPaste('1,234,567', en)).toBe(1234567);
    expect(parseNumericPaste('1,234,567', vi)).toBe(1234567);
  });

  it('lets the last separator settle a figure carrying both marks', () => {
    expect(parseNumericPaste('1.234,56', vi)).toBe(1234.56);
    expect(parseNumericPaste('1,234.56', en)).toBe(1234.56);
    expect(parseNumericPaste('1.234,56', en)).toBe(1234.56);
  });

  it('falls back to the viewer locale only for the one shape nothing else can settle', () => {
    expect(parseNumericPaste('1.234', vi)).toBe(1234);
    expect(parseNumericPaste('1.234', en)).toBe(1.234);
    expect(parseNumericPaste('1,234', en)).toBe(1234);
    expect(parseNumericPaste('1,234', vi)).toBe(1.234);
  });

  it('drops the spacing marks a locale groups with', () => {
    expect(parseNumericPaste('1 234', 'fr-FR')).toBe(1234);
    expect(parseNumericPaste('1 234,5', 'fr-FR')).toBe(1234.5);
    expect(parseNumericPaste('  42  ', en)).toBe(42);
  });

  it('keeps the sign and a bare fraction', () => {
    expect(parseNumericPaste('-5', en)).toBe(-5);
    expect(parseNumericPaste('-12,5', vi)).toBe(-12.5);
    expect(parseNumericPaste('.05', en)).toBe(0.05);
  });

  it('refuses anything it cannot read as one figure', () => {
    expect(parseNumericPaste('37h30', en)).toBeNull();
    expect(parseNumericPaste('', en)).toBeNull();
    expect(parseNumericPaste('12.', en)).toBeNull();
    expect(parseNumericPaste('1.23.456', en)).toBeNull();
    expect(parseNumericPaste('12 5', en)).toBeNull();
  });
});

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

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '12000');
    await user.type(box('Total defects'), '90000');

    expect(messageUnder(numerator)).toBeNull();
    expect(saveButton()).toBeEnabled();
  });

  it('refuses a figure wider than the column can store', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '123456789012');

    expect(messageUnder(numerator)).toBe('Max 11 digits');
    await user.click(saveButton());
    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
  });

  it('refuses a decimal where the metric counts things, but allows one where it measures', async () => {
    const user = userEvent.setup();
    renderDialog();

    const defects = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(defects, '2.6');
    expect(messageUnder(defects)).toBe('Whole number only');

    const hours = box('Worked hours');
    await user.type(hours, '37.5');
    expect(messageUnder(hours)).toBeNull();
  });

  it('lands a decimal a VN reporter pasted with the comma they write it with', async () => {
    speaksLocale('vi-VN');
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.click(hours);
    await user.paste('0,6');

    expect(hours).toHaveValue('0.6');
  });

  it('lands a dot decimal for a VN reporter too', async () => {
    speaksLocale('vi-VN');
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.click(hours);
    await user.paste('0.05');

    expect(hours).toHaveValue('0.05');
  });

  it('reads a dot-grouped thousand the way the viewer writes thousands', async () => {
    speaksLocale('vi-VN');
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.click(hours);
    await user.paste('1.234');

    expect(hours).toHaveValue('1234');
  });

  it('reads the same shape the other way round for a dot-decimal viewer', async () => {
    speaksLocale('en-US');
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.click(hours);
    await user.paste('1,234');
    expect(hours).toHaveValue('1234');

    await user.clear(hours);
    await user.paste('1.234');
    expect(hours).toHaveValue('1.234');
  });

  it('keeps a pasted figure through the blur after the box was emptied first', async () => {
    speaksLocale('en-US');
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 3,
      metrics: [base, { ...hoursRatio, component_1_value: 40 }, leadTime],
    });
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.clear(hours);
    await user.paste('12.5');
    await user.tab();

    expect(hours).toHaveValue('12.5');
  });

  it('leaves a saved figure alone when the paste is not a figure at all', async () => {
    speaksLocale('vi-VN');
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 3,
      metrics: [base, { ...hoursRatio, component_1_value: 40 }, leadTime],
    });
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.click(hours);
    await user.paste('37h30');
    await user.tab();

    expect(hours).toHaveValue('40');
  });

  it('refuses a negative count and says why, instead of dropping the keystroke', async () => {
    const user = userEvent.setup();
    renderDialog();

    const defects = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(defects, '-3');

    expect(messageUnder(defects)).toBe("Can't be negative");
  });

  it('marks the other box required once one of a pair is filled', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '5');

    expect(messageUnder(box('Total defects'))).toBe('Required');
    await user.click(saveButton());
    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
  });

  it('refuses a zero denominator', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '5');
    const denominator = box('Total defects');
    await user.type(denominator, '0');

    expect(messageUnder(denominator)).toBe("Can't be 0");
  });

  it('caps a share metric at its total but lets a rate metric run past 100%', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
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

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '20');
    await user.type(box('Total defects'), '20');

    await user.clear(numerator);
    await user.type(numerator, '60');
    expect(messageUnder(numerator)).toBe("Can't exceed Total defects");

    await user.tab();
    expect(numerator).toHaveValue('60');
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

    const days = await screen.findByRole('textbox', {
      name: 'Days occurrence → register entry',
    });
    await user.type(days, '-12');
    expect(days).toHaveValue('-12');
    expect(messageUnder(days)).toBeNull();

    await user.clear(days);
    await user.type(days, '-50');
    expect(messageUnder(days)).toBe('Enter -49 to 49');
  });

  it('leaves an out-of-range figure on screen with its error when the box loses focus', async () => {
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('textbox', {
      name: 'Days occurrence → register entry',
    });
    await user.type(days, '12');
    await user.tab();
    expect(days).toHaveValue('12');

    await user.clear(days);
    await user.type(days, '1200');
    await user.tab();

    expect(days).toHaveValue('1200');
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

    const days = await screen.findByRole('textbox', {
      name: 'Days occurrence → register entry',
    });
    await user.clear(days);
    await user.type(days, '1000');
    await user.tab();

    expect(days).toHaveValue('1000');
    expect(messageUnder(days)).toBe('Enter -49 to 49');
  });

  it('counts a blurred per-box error alongside a cross-field one', async () => {
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('textbox', {
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

    const days = await screen.findByRole('textbox', {
      name: 'Days occurrence → register entry',
    });
    await user.clear(days);
    await user.tab();

    expect(days).toHaveValue('');
  });

  it('refuses to save once an emptied metric turns the record Grey', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 3,
      metrics: [
        { ...base, component_1_value: 1, component_2_value: 20 },
        { ...hoursRatio, component_1_value: 8, component_2_value: 10 },
        { ...leadTime, component_1_value: 7 },
      ],
    });
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('textbox', {
      name: 'Days occurrence → register entry',
    });
    await user.clear(days);
    await user.tab();
    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(
      screen.getByText('1 metric is still Grey — every metric needs its figures to save'),
    ).toBeInTheDocument();
  });

  it('confirms the save to the reporter', async () => {
    upsertKpiRecordMock.mockResolvedValue({ record_id: 'rec-1', version: 4 });
    const user = userEvent.setup();
    renderDialog();

    await fillEveryMetric(user);

    const confirmations = () => screen.queryAllByText('KPI record saved').length;
    const before = confirmations();
    await user.click(saveButton());

    await waitFor(() => expect(confirmations()).toBe(before + 1));
  });

  it('tells the reporter when someone else saved the record first', async () => {
    upsertKpiRecordMock.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }));
    const user = userEvent.setup();
    renderDialog();

    await fillEveryMetric(user);
    await user.click(saveButton());

    expect(
      await screen.findByText('Someone saved this record first — reloaded the latest values.'),
    ).toBeInTheDocument();
  });

  it('replaces the on-screen figures with the winning ones after a conflict', async () => {
    upsertKpiRecordMock.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }));
    const user = userEvent.setup();
    renderDialog();

    await fillEveryMetric(user);

    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 2,
      metrics: [{ ...base, component_1_value: 3, component_2_value: 40 }, hoursRatio, leadTime],
    });
    await user.click(saveButton());

    await waitFor(() => expect(box('Production defects')).toHaveValue('3'));
    expect(box('Total defects')).toHaveValue('40');
  });

  it('computes the result and shows it in the units its bands are written in', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');

    expect(screen.getByTitle('Defect Leakage — computed from the figures above')).toHaveTextContent(
      '5%',
    );
  });

  it('shows a one-box result as the plain figure, not a percentage', async () => {
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('textbox', {
      name: 'Days occurrence → register entry',
    });
    await user.type(days, '-3');

    expect(
      screen.getByTitle('Risk Identification Lead Time — computed from the figures above'),
    ).toHaveTextContent('-3');
  });

  it('offers no box to type the result into — it is read-only text', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');

    const result = screen.getByTitle('Defect Leakage — computed from the figures above');
    expect(result.tagName).toBe('SPAN');
    expect(screen.getAllByRole('textbox')).toHaveLength(5);
  });

  it('withholds the result while a figure is unusable', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');
    expect(screen.queryByTitle('Defect Leakage — computed from the figures above')).not.toBeNull();

    await user.clear(box('Total defects'));
    await user.type(box('Total defects'), '0');

    expect(screen.queryByTitle('Defect Leakage — computed from the figures above')).toBeNull();
  });

  it('previews a colour for a ratio that falls between two band thresholds', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      metrics: [{ ...base, yellow_band: { op: 'between', min: 0.06, max: 0.1 } }],
    });
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '17');

    expect(screen.getAllByText('Amber').length).toBeGreaterThan(0);
  });

  it('withholds the RAG badge while a figure is out of range', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');
    expect(screen.getAllByText('Green').length).toBeGreaterThan(0);

    await user.clear(box('Total defects'));
    await user.type(box('Total defects'), '0');

    expect(screen.queryByText('Green')).not.toBeInTheDocument();
  });

  it('marks each unfilled metric with a dash and never invents a colour for it', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 1,
      metrics: [
        {
          ...base,
          component_1_value: 1,
          component_2_value: 20,
          computed_value: 0.05,
          status: 'green' as const,
        },
        hoursRatio,
        leadTime,
      ],
      category_health: {
        quality: 'green' as const,
        cost_capacity: null,
        delivery: null,
        process: null,
      },
      overall_health: 'green' as const,
    });
    renderDialog();

    expect((await screen.findAllByText('Green')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Red')).not.toBeInTheDocument();
  });

  it('claims the week held no record yet, so a racing first save cannot be overwritten', async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillEveryMetric(user);
    await user.click(saveButton());

    const body = upsertKpiRecordMock.mock.calls[0][0] as { expected_version: number | null };
    expect(body.expected_version).toBeNull();
  });

  it('keeps figures being typed when the record is refetched underneath', async () => {
    const user = userEvent.setup();
    const { qc } = renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '7');
    await user.tab();
    expect(numerator).toHaveValue('7');

    expect(screen.getByText('New record')).toBeInTheDocument();
    fetchKpiRecordMock.mockResolvedValue({ ...record, record_id: 'rec-1', version: 2 });
    await qc.refetchQueries();
    await waitFor(() => expect(screen.queryByText('New record')).not.toBeInTheDocument());

    expect(numerator).toHaveValue('7');
  });

  it('brings back figures typed before switching to another project', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '7');

    await user.click(screen.getByRole('combobox', { name: /^Project/ }));
    await user.click(await screen.findByRole('option', { name: 'Acme Billing Revamp' }));
    await waitFor(() => expect(box('Production defects')).toHaveValue(''));

    await user.click(screen.getByRole('combobox', { name: /^Project/ }));
    await user.click(await screen.findByRole('option', { name: 'Acme Analytics Hub' }));

    await waitFor(() => expect(box('Production defects')).toHaveValue('7'));
  });

  it('keeps a letter on screen and says it is not a figure', async () => {
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.type(hours, 'đas');

    expect(hours).toHaveValue('đas');
    expect(messageUnder(hours)).toBe('Enter a number');
  });

  it('refuses to save a metric whose box holds a letter', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '2');
    await user.type(box('Total defects'), '4o');

    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(screen.getByText('1 figure needs fixing')).toBeInTheDocument();
  });

  it('withholds the overall colour while a metric holds a letter', async () => {
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.type(hours, 'abc');

    expect(within(headerBadges()).getByText('—')).toBeInTheDocument();
    expect(within(headerBadges()).queryByText('Grey')).not.toBeInTheDocument();
  });

  it('clears the complaint once the letter is taken back out', async () => {
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.type(hours, '3x');
    expect(messageUnder(hours)).toBe('Enter a number');

    await user.type(hours, '{Backspace}7');

    expect(hours).toHaveValue('37');
    expect(messageUnder(hours)).toBeNull();
  });

  it('says nothing about a figure still being typed', async () => {
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('textbox', {
      name: 'Days occurrence → register entry',
    });
    await user.type(days, '-');
    expect(messageUnder(days)).toBeNull();

    const hours = box('Worked hours');
    await user.type(hours, '12.');
    expect(messageUnder(hours)).toBeNull();
  });

  it('saves the metric that held a letter once a real figure replaces it', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '2');
    await user.type(box('Total defects'), '40');
    await user.type(box('Worked hours'), 'abc');
    await user.clear(box('Worked hours'));
    await user.type(box('Worked hours'), '8');
    await user.type(box('Available hours'), '10');
    await user.type(box('Days occurrence → register entry'), '-1');

    await user.click(saveButton());

    await waitFor(() => expect(upsertKpiRecordMock).toHaveBeenCalledTimes(1));
    expect(upsertKpiRecordMock.mock.calls[0]?.[0].entries).toContainEqual({
      metric_id: hoursRatio.metric_id,
      component_1_value: 8,
      component_2_value: 10,
    });
  });

  it('jumps to the figure that needs fixing instead of leaving Save inert', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
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

    const worked = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.type(worked, '45');
    await user.type(box('Production defects'), '5');

    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(screen.getByText('2 figures need fixing')).toBeInTheDocument();
    expect(box('Total defects')).toHaveFocus();
  });

  it('names how many metrics are still Grey rather than a Save that does nothing', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole('textbox', { name: 'Production defects' });
    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(screen.getByText(greyBlock(3))).toBeInTheDocument();
    expect(box('Production defects')).toHaveFocus();
  });

  it('marks every box a Grey metric still needs, and only those', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');
    await user.click(saveButton());

    expect(numerator).not.toHaveAttribute('aria-invalid');
    expect(box('Total defects')).not.toHaveAttribute('aria-invalid');
    expect(box('Worked hours')).toHaveAttribute('aria-invalid', 'true');
    expect(box('Available hours')).toHaveAttribute('aria-invalid', 'true');
    expect(box('Days occurrence → register entry')).toHaveAttribute('aria-invalid', 'true');
  });

  it('says nothing under a box that is merely empty, so only the footer explains', async () => {
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.click(saveButton());

    expect(hours).toHaveAttribute('aria-invalid', 'true');
    expect(messageUnder(hours)).toBeNull();
  });

  it('marks a half-typed figure that no other box can complain about', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(await screen.findByRole('textbox', { name: 'Production defects' }), '1');
    await user.type(box('Total defects'), '20');
    await user.type(box('Worked hours'), '8');
    await user.type(box('Available hours'), '10');
    const days = box('Days occurrence → register entry');
    await user.type(days, '7.');
    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(screen.getByText(greyBlock(1))).toBeInTheDocument();
    expect(days).toHaveAttribute('aria-invalid', 'true');
    expect(messageUnder(days)).toBe('Enter a number');
  });

  it('marks both boxes of a two-component metric when neither figure is readable', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '12.');
    await user.type(box('Total defects'), '20.');
    await user.type(box('Worked hours'), '8');
    await user.type(box('Available hours'), '10');
    await user.type(box('Days occurrence → register entry'), '-1');
    await user.click(saveButton());

    expect(upsertKpiRecordMock).not.toHaveBeenCalled();
    expect(screen.getByText(greyBlock(1))).toBeInTheDocument();
    expect(numerator).toHaveAttribute('aria-invalid', 'true');
    expect(messageUnder(numerator)).toBe('Enter a number');
    expect(box('Total defects')).toHaveAttribute('aria-invalid', 'true');
    expect(messageUnder(box('Total defects'))).toBe('Enter a number');
  });

  it('clears the mark on a box as soon as its figure lands', async () => {
    const user = userEvent.setup();
    renderDialog();

    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });
    await user.click(saveButton());
    expect(hours).toHaveAttribute('aria-invalid', 'true');

    await user.type(hours, '8');
    await user.type(box('Available hours'), '10');

    expect(hours).not.toHaveAttribute('aria-invalid');
    expect(box('Available hours')).not.toHaveAttribute('aria-invalid');
  });

  it('leaves the boxes unmarked until the reporter has actually tried to save', async () => {
    renderDialog();
    const hours = await screen.findByRole('textbox', { name: 'Worked hours' });

    expect(hours).not.toHaveAttribute('aria-invalid');
  });

  it('counts down the Grey metrics as the reporter fills them in', async () => {
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.click(saveButton());
    expect(screen.getByText(greyBlock(3))).toBeInTheDocument();

    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');
    expect(screen.getByText(greyBlock(2))).toBeInTheDocument();

    await user.type(box('Worked hours'), '8');
    await user.type(box('Available hours'), '10');
    await user.type(box('Days occurrence → register entry'), '-1');

    expect(screen.queryByText(/needs? fixing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/still Grey/)).not.toBeInTheDocument();
  });

  it('drops the blocking message when the reporter moves to another project', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole('textbox', { name: 'Production defects' });
    await user.click(saveButton());
    expect(screen.getByText(greyBlock(3))).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /^Project/ }));
    await user.click(await screen.findByRole('option', { name: 'Acme Billing Revamp' }));
    await waitFor(() => expect(box('Production defects')).toHaveValue(''));

    expect(screen.queryByText(/still Grey/)).not.toBeInTheDocument();
  });

  it('brings the blocking message back on the project it was raised for', async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByRole('textbox', { name: 'Production defects' });
    await user.click(saveButton());

    await user.click(screen.getByRole('combobox', { name: /^Project/ }));
    await user.click(await screen.findByRole('option', { name: 'Acme Billing Revamp' }));
    await waitFor(() => expect(screen.queryByText(/still Grey/)).not.toBeInTheDocument());

    await user.click(screen.getByRole('combobox', { name: /^Project/ }));
    await user.click(await screen.findByRole('option', { name: 'Acme Analytics Hub' }));

    expect(await screen.findByText(greyBlock(3))).toBeInTheDocument();
  });

  it('holds Save shut until the record reloaded after a conflict has landed', async () => {
    upsertKpiRecordMock.mockRejectedValue(Object.assign(new Error('Conflict'), { status: 409 }));
    const user = userEvent.setup();
    renderDialog();

    await fillEveryMetric(user);

    let landReload: ((v: unknown) => void) | null = null;
    fetchKpiRecordMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          landReload = resolve;
        }),
    );
    const conflicts = () =>
      screen.queryAllByText('Someone saved this record first — reloaded the latest values.').length;
    const before = conflicts();
    await user.click(saveButton());
    await waitFor(() => expect(conflicts()).toBe(before + 1));

    expect(saveButton()).toBeDisabled();

    landReload?.({ ...record, record_id: 'rec-1', version: 9 });
    await waitFor(() => expect(saveButton()).toBeEnabled());
  });

  it('saves once every metric is filled and in range', async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillEveryMetric(user);
    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());
    expect(upsertKpiRecordMock).toHaveBeenCalledOnce();
  });

  it('closes on Cancel without asking when nothing has been typed', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await screen.findByRole('textbox', { name: 'Production defects' });
    await user.click(cancelButton());

    expect(discardPrompt()).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('asks before dropping figures the reporter typed but has not saved', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.click(cancelButton());

    expect(discardPrompt()).not.toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('asks the same way when the reporter dismisses with the close button', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(discardPrompt()).not.toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps the figures on screen when the reporter backs out of discarding', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.click(cancelButton());
    await user.click(within(discardPrompt()!).getByRole('button', { name: 'Keep editing' }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(box('Production defects')).toHaveValue('1');
  });

  it('closes once the reporter confirms the discard', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.click(cancelButton());
    await user.click(within(discardPrompt()!).getByRole('button', { name: 'Discard' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('takes Cancel away while a save is on its way', async () => {
    upsertKpiRecordMock.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderDialog();

    await fillEveryMetric(user);
    await user.click(saveButton());

    await waitFor(() => expect(cancelButton()).toBeDisabled());
  });

  it('holds the form open when a save is on its way and the reporter presses Escape', async () => {
    upsertKpiRecordMock.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await fillEveryMetric(user);
    await user.click(saveButton());
    await waitFor(() => expect(cancelButton()).toBeDisabled());

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(discardPrompt()).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does not ask again once a figure is typed back to what was saved', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 3,
      metrics: [base, hoursRatio, { ...leadTime, component_1_value: 7 }],
    });
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    const days = await screen.findByRole('textbox', {
      name: 'Days occurrence → register entry',
    });
    await user.clear(days);
    await user.type(days, '7');
    await user.click(cancelButton());

    expect(discardPrompt()).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('turns the whole pillar Grey when one of its metrics has no figures', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      metrics: [base, reopened, hoursRatio, leadTime],
    });
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '1');
    await user.type(box('Total defects'), '20');

    expect(pillarFlag('Q — Quality').getByText('—')).toBeInTheDocument();
  });

  it('keeps the pillar Grey even when the metric beside it reads Red', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      metrics: [base, reopened, hoursRatio, leadTime],
    });
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '9');
    await user.type(box('Total defects'), '20');
    expect(pillarFlag('Q — Quality').getByText('—')).toBeInTheDocument();
    expect(pillarFlag('Q — Quality').queryByText('Red')).not.toBeInTheDocument();
  });

  it('settles the pillar on its worst metric once every metric in it is filled', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      metrics: [base, reopened, hoursRatio, leadTime],
    });
    const user = userEvent.setup();
    renderDialog();

    const numerator = await screen.findByRole('textbox', { name: 'Production defects' });
    await user.type(numerator, '9');
    await user.type(box('Total defects'), '20');
    await user.type(box('Reopened defects'), '1');
    await user.type(box('Total defects closed'), '20');

    expect(pillarFlag('Q — Quality').getByText('Red')).toBeInTheDocument();
  });

  it('marks the overall with a dash while nothing has been assessed', async () => {
    renderDialog();
    await screen.findByRole('textbox', { name: 'Production defects' });

    expect(within(headerBadges()).getByText('—')).toBeInTheDocument();
  });

  it('leaves both the Grey pillar and the overall on a dash, naming neither', async () => {
    renderDialog();
    await screen.findByRole('textbox', { name: 'Production defects' });

    expect(pillarFlag('Q — Quality').getByText('—')).toBeInTheDocument();
    expect(within(headerBadges()).getByText('—')).toBeInTheDocument();
  });

  it('drops the overall back to a dash when a saved figure is cleared', async () => {
    fetchKpiRecordMock.mockResolvedValue({
      ...record,
      record_id: 'rec-1',
      version: 3,
      metrics: [
        { ...base, component_1_value: 1, component_2_value: 20 },
        { ...hoursRatio, component_1_value: 8, component_2_value: 10 },
        { ...leadTime, component_1_value: -1 },
      ],
    });
    const user = userEvent.setup();
    renderDialog();

    const days = await screen.findByRole('textbox', {
      name: 'Days occurrence → register entry',
    });
    expect(within(headerBadges()).getByText('Green')).toBeInTheDocument();

    await user.clear(days);
    await user.tab();

    expect(within(headerBadges()).getByText('—')).toBeInTheDocument();
    expect(pillarFlag('P — Process').getByText('—')).toBeInTheDocument();
  });

  it('leaves a pillar with no applied metric out of the way of a save', async () => {
    const user = userEvent.setup();
    renderDialog();

    await fillEveryMetric(user);

    expect(screen.queryByRole('heading', { name: 'D — Delivery' })).not.toBeInTheDocument();
    await user.click(saveButton());
    expect(upsertKpiRecordMock).toHaveBeenCalledOnce();
  });
});
