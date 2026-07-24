import type { AllocationGridRow } from '../api/allocation-client.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toCsvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Pure function — returns CSV string with UTF-8 BOM. Separated from DOM trigger for testability. */
export function buildAllocationCsv(rows: AllocationGridRow[], _year: number): string {
  const header = ['Employee ID', 'Name', 'Account', 'Project', 'Bucket', ...MONTHS, 'Total MM'];
  const lines = rows.map((r) => [
    r.employee_no ?? '',
    r.full_name,
    r.account_name,
    r.is_account_am ? 'Account management' : (r.project_name ?? ''),
    r.bucket ?? '',
    // Raw percentage integer — NOT formatLoad fraction.
    // CSV consumers (Excel) need raw values for SUM/AVERAGE.
    ...r.months.map((v) => (v == null ? '' : String(v))),
    r.total_mm.toFixed(2),
  ]);
  return '\uFEFF' + [header, ...lines].map((line) => line.map(toCsvCell).join(',')).join('\n');
}

/** Trigger browser download of the CSV. */
export function exportAllocationCsv(rows: AllocationGridRow[], year: number): void {
  const csv = buildAllocationCsv(rows, year);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `resource-allocation-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
