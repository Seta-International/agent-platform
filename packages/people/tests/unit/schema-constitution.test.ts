import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { employmentPeriod, person, personSkill, worker } from '../../src/backend/db/schema.ts';

describe('people schema constitution', () => {
  it('employment_period has a single state machine (no status column)', () => {
    const cols = getTableConfig(employmentPeriod).columns.map((c) => c.name);
    expect(cols).not.toContain('status');
    expect(cols).toContain('lifecycle_stage');
  });

  it('worker stores working hours as time columns, not jsonb', () => {
    const cols = getTableConfig(worker).columns.map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['work_start', 'work_end']));
    expect(cols).not.toContain('working_hours');
  });

  it('mutable aggregates carry version', () => {
    for (const t of [person, employmentPeriod, personSkill]) {
      expect(getTableConfig(t).columns.some((c) => c.name === 'version')).toBe(true);
    }
  });

  it('worker.person_id is a real FK', () => {
    expect(getTableConfig(worker).foreignKeys.length).toBeGreaterThan(0);
  });

  it('person_skill.level is CHECK-bounded and availability has a CHECK', () => {
    expect(
      getTableConfig(personSkill).checks.some((c) => c.name === 'person_skill_level_check'),
    ).toBe(true);
    expect(
      getTableConfig(worker).checks.some((c) => c.name === 'worker_availability_status_check'),
    ).toBe(true);
  });
});
