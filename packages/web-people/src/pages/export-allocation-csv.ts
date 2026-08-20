import type { AllocationGridRow } from '../api/allocation-client.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toCsvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Shared fraction format for the allocation grid's monthly cells — CSV must match the UI, so the
 *  month percentage (100 = 100%) is divided to man-months (1.0) exactly like the grid renders it. */
export function formatLoad(pct: number): string {
  const frac = pct / 100;
  return Number.isInteger(frac) ? frac.toFixed(1) : String(Number(frac.toFixed(2)));
}

/** Pure function — returns CSV string with UTF-8 BOM. Separated from DOM trigger for testability. */
export function buildAllocationCsv(rows: AllocationGridRow[], _year: number): string {
  const header = ['Employee ID', 'Name', 'Account', 'Project', 'Bucket', ...MONTHS, 'Total MM'];
  const lines = rows.map((r) => [
    r.employee_no ?? '',
    r.full_name,
    r.account_name,
    r.project_name ?? '',
    r.bucket ?? '',
    // FUT-906: exported months must match the UI cells — same formatLoad fraction (100 → "1.0"),
    // so SUM in the sheet equals the Total MM column, not raw percentages.
    ...r.months.map((v) => (v == null ? '' : formatLoad(v))),
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
