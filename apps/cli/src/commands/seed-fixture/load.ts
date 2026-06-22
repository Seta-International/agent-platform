import { join } from 'node:path';
// xlsx ships a CJS default export. Node ESM→CJS interop wraps exports on `.default`
// when the module is loaded natively, so accept either shape.
import * as _XLSX from 'xlsx';

const XLSX = ((_XLSX as unknown as { default?: typeof _XLSX }).default ?? _XLSX) as typeof _XLSX;

export interface EmployeeRec {
  id: string;
  full_name: string;
  work_email: string;
  employment_type: string;
  primary_role: string;
  phone: string;
  gender: string;
  hire_date: string;
}

export interface ProjectRec {
  code: string;
  project_name: string;
  account_name: string;
  account_industry: string;
  dept: string;
  am_employee_id: string;
  pm_employee_id: string;
}

/** Org leadership: who heads / sits in which unit, overriding allocation-derived placement. */
export interface LeadershipRec {
  employee_id: string;
  org_unit: string;
  head: string;
}

export interface AllocationRec {
  employee_id: string;
  project_code: string;
  role: string;
  ratio_pct: number;
  man_days: number;
  month: string;
}

export const FIXTURE_FILE = 'seta-fixture.xlsx';

/** Read one workbook sheet as string-keyed rows; every cell is coerced to a trimmed string. */
function sheet(wb: _XLSX.WorkBook, name: string): Record<string, string>[] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`${FIXTURE_FILE} is missing the "${name}" sheet`);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
  return rows.map((r) => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) out[k] = String(v ?? '').trim();
    return out;
  });
}

export function loadFixtures(dir: string) {
  const wb = XLSX.readFile(join(dir, FIXTURE_FILE));
  const employees = sheet(wb, 'Employees') as unknown as EmployeeRec[];
  const projects = sheet(wb, 'Projects') as unknown as ProjectRec[];
  const allocations: AllocationRec[] = sheet(wb, 'Allocations').map((r) => ({
    employee_id: r.employee_id ?? '',
    project_code: r.project_code ?? '',
    role: r.role ?? '',
    ratio_pct: Number(r.ratio_pct),
    man_days: Number(r.man_days),
    month: r.month ?? '',
  }));
  // Leadership is optional — a workbook without the sheet falls back to allocation-derived placement.
  const leadership = wb.Sheets.Leadership
    ? (sheet(wb, 'Leadership') as unknown as LeadershipRec[])
    : [];
  return { employees, projects, allocations, leadership };
}
