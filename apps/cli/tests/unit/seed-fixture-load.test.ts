import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as _XLSX from 'xlsx';
import { loadFixtures } from '../../src/commands/seed-fixture/load.ts';

const XLSX = ((_XLSX as unknown as { default?: typeof _XLSX }).default ?? _XLSX) as typeof _XLSX;

describe('loadFixtures', () => {
  it('parses the workbook sheets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['id', 'full_name', 'work_email', 'employment_type', 'primary_role'],
        ['9001', 'Test Pm', 'pm.test@example.com', 'full_time', 'PM'],
      ]),
      'Employees',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [
          'code',
          'project_name',
          'account_name',
          'account_industry',
          'dept',
          'am_employee_id',
          'pm_employee_id',
        ],
        ['STP007', 'JetX', 'JetX', 'Software', '', '9001', ''],
      ]),
      'Projects',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['employee_id', 'project_code', 'role', 'ratio_pct', 'man_days', 'month'],
        ['9001', 'STP007', 'PM', '100', '22', '2026-05'],
      ]),
      'Allocations',
    );
    XLSX.writeFile(wb, join(dir, 'seta-fixture.xlsx'));

    const fx = loadFixtures(dir);
    expect(fx.employees).toHaveLength(1);
    expect(fx.employees[0].work_email).toBe('pm.test@example.com');
    expect(fx.projects[0].account_name).toBe('JetX');
    expect(fx.allocations[0].ratio_pct).toBe(100);
  });
});
