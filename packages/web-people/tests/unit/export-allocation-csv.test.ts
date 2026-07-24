import { describe, expect, it } from 'vitest';
import type { AllocationGridRow } from '../../src/api/allocation-client.ts';
import { buildAllocationCsv } from '../../src/pages/export-allocation-csv.ts';

function makeRow(overrides: Partial<AllocationGridRow> = {}): AllocationGridRow {
  return {
    worker_id: 'w1',
    employee_no: 'E001',
    full_name: 'Ada Lovelace',
    account_id: 'a1',
    account_name: 'Acme Corp',
    project_id: 'p1',
    project_name: 'Apollo',
    is_account_am: false,
    bucket: 'billable',
    months: [100, 100, 50, 50, null, null, null, null, null, null, null, null],
    ytd_pct: 75,
    fy_pct: 60,
    total_mm: 6.1,
    ...overrides,
  };
}

function parseCsv(csv: string): string[][] {
  // Strip BOM before parsing
  const raw = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;
  return raw.split('\n').map((line) => line.split(','));
}

describe('buildAllocationCsv', () => {
  it('produces a header row and one data row for a single input row', () => {
    const csv = buildAllocationCsv([makeRow()], 2026);
    const rows = parseCsv(csv);

    expect(rows).toHaveLength(2); // header + 1 data row
    expect(rows[0]).toEqual([
      'Employee ID',
      'Name',
      'Account',
      'Project',
      'Bucket',
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
      'YTD %',
      'FY %',
      'Total MM',
    ]);

    const data = rows[1];
    expect(data[0]).toBe('E001'); // employee_no
    expect(data[1]).toBe('Ada Lovelace'); // full_name
    expect(data[2]).toBe('Acme Corp'); // account_name
    expect(data[3]).toBe('Apollo'); // project_name
    expect(data[4]).toBe('billable'); // bucket
    expect(data[5]).toBe('100'); // Jan — raw percentage, NOT "1.0"
    expect(data[6]).toBe('100'); // Feb
    expect(data[7]).toBe('50'); // Mar — raw percentage, NOT "0.5"
    expect(data[8]).toBe('50'); // Apr
    expect(data[9]).toBe(''); // May — null → empty
    expect(data[17]).toBe('75'); // YTD %
    expect(data[18]).toBe('60'); // FY %
    expect(data[19]).toBe('6.10'); // Total MM — 2 decimal places
  });

  it('escapes cell values containing commas (RFC 4180)', () => {
    const csv = buildAllocationCsv([makeRow({ full_name: 'Nguyễn, Văn A' })], 2026);
    const raw = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;
    const dataLine = raw.split('\n')[1];
    expect(dataLine).toContain('"Nguyễn, Văn A"');
  });

  it('escapes cell values containing double quotes', () => {
    const csv = buildAllocationCsv([makeRow({ account_name: 'He said "hello"' })], 2026);
    const raw = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;
    const dataLine = raw.split('\n')[1];
    expect(dataLine).toContain('"He said ""hello"""');
  });

  it('escapes cell values containing newlines', () => {
    const csv = buildAllocationCsv([makeRow({ project_name: 'Line1\nLine2' })], 2026);
    const raw = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;
    // The entire CSV should still have the data on one logical line (quoted)
    // Split on \n that are NOT inside quotes: header + data = at least 2 lines
    // The newline inside the cell is enclosed in quotes
    expect(raw).toContain('"Line1\nLine2"');
  });

  it('renders null months as empty cells', () => {
    const allNull = new Array(12).fill(null) as (number | null)[];
    const csv = buildAllocationCsv([makeRow({ months: allNull })], 2026);
    const rows = parseCsv(csv);
    const data = rows[1];
    // Months are columns 5..16 (0-indexed)
    for (let i = 5; i <= 16; i++) {
      expect(data[i]).toBe('');
    }
  });

  it('renders months as raw integer percentages, not fractions', () => {
    const months = [50, 75, 100, 120, null, null, null, null, null, null, null, null] as (
      | number
      | null
    )[];
    const csv = buildAllocationCsv([makeRow({ months })], 2026);
    const rows = parseCsv(csv);
    const data = rows[1];
    expect(data[5]).toBe('50'); // NOT "0.5"
    expect(data[6]).toBe('75'); // NOT "0.75"
    expect(data[7]).toBe('100'); // NOT "1.0"
    expect(data[8]).toBe('120'); // NOT "1.2"
  });

  it('renders "Account management" for AM rows instead of project name', () => {
    const csv = buildAllocationCsv(
      [makeRow({ is_account_am: true, project_name: 'Should not appear' })],
      2026,
    );
    const rows = parseCsv(csv);
    expect(rows[1][3]).toBe('Account management');
  });

  it('returns only header + BOM when rows are empty', () => {
    const csv = buildAllocationCsv([], 2026);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1); // header only
    expect(rows[0][0]).toBe('Employee ID');
  });

  it('renders null bucket as empty cell', () => {
    const csv = buildAllocationCsv([makeRow({ bucket: null })], 2026);
    const rows = parseCsv(csv);
    expect(rows[1][4]).toBe('');
  });

  it('starts with UTF-8 BOM for Excel compatibility', () => {
    const csv = buildAllocationCsv([makeRow()], 2026);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('formats total_mm with exactly 2 decimal places', () => {
    const csv = buildAllocationCsv([makeRow({ total_mm: 3 })], 2026);
    const rows = parseCsv(csv);
    expect(rows[1][19]).toBe('3.00');
  });

  it('renders null employee_no as empty cell', () => {
    const csv = buildAllocationCsv([makeRow({ employee_no: null })], 2026);
    const rows = parseCsv(csv);
    expect(rows[1][0]).toBe('');
  });

  it('handles multiple rows preserving order', () => {
    const csv = buildAllocationCsv(
      [
        makeRow({ full_name: 'Alice', total_mm: 3 }),
        makeRow({ worker_id: 'w2', full_name: 'Bob', total_mm: 9 }),
      ],
      2026,
    );
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3); // header + 2
    expect(rows[1][1]).toBe('Alice');
    expect(rows[2][1]).toBe('Bob');
  });
});
