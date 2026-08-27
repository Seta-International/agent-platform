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
    bucket: 'billable',
    months: [100, 100, 50, 50, null, null, null, null, null, null, null, null],
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
      'Total MM',
    ]);

    const data = rows[1];
    expect(data[0]).toBe('E001'); // employee_no
    expect(data[1]).toBe('Ada Lovelace'); // full_name
    expect(data[2]).toBe('Acme Corp'); // account_name
    expect(data[3]).toBe('Apollo'); // project_name
    expect(data[4]).toBe('billable'); // bucket
    expect(data[5]).toBe('1.0'); // Jan — 100% = 1.0 MM, same as the UI cell
    expect(data[6]).toBe('1.0'); // Feb
    expect(data[7]).toBe('0.5'); // Mar — 50% = 0.5 MM
    expect(data[8]).toBe('0.5'); // Apr
    expect(data[9]).toBe(''); // May — null → empty
    expect(data[17]).toBe('6.10'); // Total MM — 2 decimal places
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

  it('renders months as man-month fractions, matching the UI grid cells (FUT-906)', () => {
    const months = [50, 75, 100, 120, null, null, null, null, null, null, null, null] as (
      | number
      | null
    )[];
    const csv = buildAllocationCsv([makeRow({ months })], 2026);
    const rows = parseCsv(csv);
    const data = rows[1];
    expect(data[5]).toBe('0.5'); // 50% → 0.5 MM
    expect(data[6]).toBe('0.75'); // 75% → 0.75 MM
    expect(data[7]).toBe('1.0'); // 100% → 1.0 MM
    expect(data[8]).toBe('1.2'); // 120% → 1.2 MM
  });

  it('renders project name directly in project column', () => {
    const csv = buildAllocationCsv([makeRow({ project_name: 'Project VERI-AD' })], 2026);
    const rows = parseCsv(csv);
    expect(rows[1][3]).toBe('Project VERI-AD');
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
    expect(rows[1][17]).toBe('3.00');
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

  it('exports idle worker with empty account, project, bucket, blank months and 0.00 Total MM (FUT-339 AC 2)', () => {
    const idleRow: AllocationGridRow = {
      worker_id: 'w-idle',
      employee_no: 'I100',
      full_name: 'Idle Employee',
      account_id: '',
      account_name: '',
      project_id: '',
      project_name: null,
      bucket: null,
      months: new Array(12).fill(null),
      total_mm: 0,
    };
    const csv = buildAllocationCsv([idleRow], 2026);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual([
      'I100',
      'Idle Employee',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '0.00',
    ]);
  });
});
