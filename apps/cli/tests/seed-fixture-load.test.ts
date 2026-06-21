import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadFixtures } from '../src/commands/seed-fixture/load.ts';

describe('loadFixtures', () => {
  it('parses the three CSVs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-'));
    writeFileSync(
      join(dir, 'employees.csv'),
      'id,full_name,work_email,employment_type,primary_role\n6862,"Nguyễn Duy Đạt",dat.nguyenduy@seta-international.vn,full_time,DEV\n',
    );
    writeFileSync(
      join(dir, 'projects.csv'),
      'code,project_name,account_name,account_industry,dept,pm_employee_id\nSTP007,"JetX",JetX,Software,,6862\n',
    );
    writeFileSync(
      join(dir, 'allocations.csv'),
      'employee_id,project_code,role,ratio_pct,man_days,month\n6862,STP007,DEV,100,22,2026-05\n',
    );
    const fx = loadFixtures(dir);
    expect(fx.employees).toHaveLength(1);
    expect(fx.employees[0].work_email).toBe('dat.nguyenduy@seta-international.vn');
    expect(fx.projects[0].account_name).toBe('JetX');
    expect(fx.allocations[0].ratio_pct).toBe(100);
  });
});
