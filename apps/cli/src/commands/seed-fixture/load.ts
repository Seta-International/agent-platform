import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';

export interface EmployeeRec {
  id: string;
  full_name: string;
  work_email: string;
  employment_type: string;
  primary_role: string;
}

export interface ProjectRec {
  code: string;
  project_name: string;
  account_name: string;
  account_industry: string;
  dept: string;
  pm_employee_id: string;
}

export interface AllocationRec {
  employee_id: string;
  project_code: string;
  role: string;
  ratio_pct: number;
  man_days: number;
  month: string;
}

function read<T>(dir: string, file: string): T[] {
  return parse(readFileSync(join(dir, file), 'utf-8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
  }) as T[];
}

export function loadFixtures(dir: string) {
  const employees = read<EmployeeRec>(dir, 'employees.csv');
  const projects = read<ProjectRec>(dir, 'projects.csv');
  const allocationsRaw = read<Record<string, string>>(dir, 'allocations.csv');
  const allocations: AllocationRec[] = allocationsRaw.map((r) => ({
    employee_id: r['employee_id'] ?? '',
    project_code: r['project_code'] ?? '',
    role: r['role'] ?? '',
    ratio_pct: Number(r['ratio_pct']),
    man_days: Number(r['man_days']),
    month: r['month'] ?? '',
  }));
  return { employees, projects, allocations };
}
