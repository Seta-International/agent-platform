import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// xlsx ships a CJS default export. Node ESM→CJS interop wraps exports on `.default`
// when the module is loaded natively (e.g. after a top-level await in the entry file).
// The `(ns.default ?? ns)` pattern handles both loader paths transparently.
import * as _XLSX from 'xlsx';

const XLSX = ((_XLSX as unknown as { default?: typeof _XLSX }).default ?? _XLSX) as typeof _XLSX;

import { classifyRow, deriveEmail } from './lib/employee-fixtures.ts';

export function xlsxToFixturesCommand(opts: { xlsx: string; out: string }): void {
  const wb = XLSX.readFile(opts.xlsx);
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) throw new Error(`xlsx has no readable sheet: ${opts.xlsx}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });

  const employees = new Map<
    string,
    { id: string; full_name: string; role: string; employment_type: string }
  >();
  const projects = new Map<string, { code: string | null; project_name: string }>();
  const allocations: Array<{
    employee_id: string;
    project_code: string;
    role: string;
    ratio_pct: number;
    man_days: number;
  }> = [];

  let curProject: { name: string; code: string | null } | null = null;
  for (const row of rows) {
    const c = classifyRow(row);
    if (c.kind === 'header') {
      curProject = { name: c.project, code: c.code };
      projects.set(c.project, { code: c.code, project_name: c.project });
      continue;
    }
    if (c.kind === 'member' && curProject) {
      if (!employees.has(c.id)) {
        employees.set(c.id, {
          id: c.id,
          full_name: c.name,
          role: c.role ?? 'DEV',
          employment_type: 'full_time',
        });
      }
      allocations.push({
        employee_id: c.id,
        project_code: curProject.code ?? curProject.name,
        role: c.role ?? 'DEV',
        ratio_pct: Math.round((c.ratio ?? 0) * 100),
        man_days: c.manDays ?? 0,
      });
    }
  }

  mkdirSync(opts.out, { recursive: true });

  const taken = new Set<string>();
  const empCsv = ['id,full_name,work_email,employment_type,primary_role'];
  for (const e of employees.values()) {
    empCsv.push(
      `${e.id},"${e.full_name}",${deriveEmail(e.full_name, e.id, taken)},${e.employment_type},${e.role}`,
    );
  }
  writeFileSync(join(opts.out, 'employees.csv'), `${empCsv.join('\n')}\n`);

  const projCsv = ['code,project_name,account_name,account_industry,dept,pm_employee_id'];
  for (const p of projects.values()) {
    projCsv.push(`${p.code ?? p.project_name},"${p.project_name}",,,,`);
  }
  writeFileSync(join(opts.out, 'projects.csv'), `${projCsv.join('\n')}\n`);

  const allocCsv = ['employee_id,project_code,role,ratio_pct,man_days,month'];
  for (const a of allocations) {
    allocCsv.push(
      `${a.employee_id},${a.project_code},${a.role},${a.ratio_pct},${a.man_days},2026-05`,
    );
  }
  writeFileSync(join(opts.out, 'allocations.csv'), `${allocCsv.join('\n')}\n`);

  process.stdout.write(
    `${JSON.stringify({
      employees: employees.size,
      projects: projects.size,
      allocations: allocations.length,
    })}\n`,
  );
}
