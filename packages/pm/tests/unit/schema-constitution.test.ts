import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  accountRecruiter,
  allocation,
  staffingPlanLine,
  staffingPlanLineSkill,
} from '../../src/backend/db/schema.ts';

describe('pm schema constitution', () => {
  it('staffing plan skills are a normalized child table, not jsonb', () => {
    expect(getTableConfig(staffingPlanLineSkill).name).toBe('staffing_plan_line_skill');
    expect(getTableConfig(staffingPlanLine).columns.map((c) => c.name)).not.toContain('skills');
  });

  it('placeholder-per-request unique is tenant-led', () => {
    const idx = getTableConfig(allocation).indexes.find((i) =>
      i.config.name?.includes('one_placeholder_per_request'),
    );
    const first = idx?.config.columns[0];
    expect(first && 'name' in first ? first.name : '').toBe('tenant_id');
  });

  it('allocation bounds weekday_mask and planned_pct', () => {
    const checks = getTableConfig(allocation).checks.map((c) => c.name);
    expect(checks).toEqual(
      expect.arrayContaining(['allocation_weekday_mask_check', 'allocation_planned_pct_check']),
    );
  });

  it('account_recruiter carries version', () => {
    expect(getTableConfig(accountRecruiter).columns.some((c) => c.name === 'version')).toBe(true);
  });
});
