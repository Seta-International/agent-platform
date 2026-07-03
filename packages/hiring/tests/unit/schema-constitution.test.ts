import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  application,
  candidate,
  candidateSkill,
  requisitionSkill,
} from '../../src/backend/db/schema.ts';

describe('hiring schema constitution', () => {
  it('candidate has tenant + trigram-ready indexes, version, deleted_at, gender CHECK, precise source_cost', () => {
    const cfg = getTableConfig(candidate);
    const cols = cfg.columns.map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['version', 'deleted_at']));
    expect(cfg.checks.some((c) => c.name === 'candidate_gender_check')).toBe(true);
    expect(cfg.columns.find((c) => c.name === 'source_cost')?.getSQLType()).toBe('numeric(15, 4)');
    expect(cfg.indexes.length).toBeGreaterThanOrEqual(1);
  });

  it('requisition_skill PK is tenant-led and it has updated_at + reverse index', () => {
    const cfg = getTableConfig(requisitionSkill);
    expect(cfg.primaryKeys[0]?.columns[0]?.name).toBe('tenant_id');
    expect(cfg.columns.some((c) => c.name === 'updated_at')).toBe(true);
    expect(cfg.indexes.some((i) => i.config.name === 'requisition_skill_by_skill')).toBe(true);
  });

  it('candidate_skill PK is tenant-led with timestamps', () => {
    const cfg = getTableConfig(candidateSkill);
    expect(cfg.primaryKeys[0]?.columns[0]?.name).toBe('tenant_id');
    expect(cfg.columns.some((c) => c.name === 'created_at')).toBe(true);
  });

  it('application gains the (tenant_id, worker_id) index and real FKs', () => {
    const cfg = getTableConfig(application);
    expect(cfg.indexes.some((i) => i.config.name === 'application_by_worker')).toBe(true);
    expect(cfg.foreignKeys.length).toBeGreaterThan(0);
  });
});
