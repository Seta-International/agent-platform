import { describe, expect, it } from 'vitest';
import { upsertKpiRecordInput } from '../../src/contracts.ts';

const body = (expected_version: unknown) => ({
  project_id: crypto.randomUUID(),
  iso_year: 2026,
  iso_week: 29,
  expected_version,
  entries: [],
});

describe('upsertKpiRecordInput — expected_version', () => {
  it('takes a version the caller loaded', () => {
    expect(upsertKpiRecordInput.safeParse(body(3)).success).toBe(true);
  });

  it('takes null, the way a caller says it loaded a week with no record yet', () => {
    expect(upsertKpiRecordInput.safeParse(body(null)).success).toBe(true);
  });

  it('takes it being absent, for a caller that is not claiming anything', () => {
    expect(upsertKpiRecordInput.safeParse(body(undefined)).success).toBe(true);
  });

  it('rejects a version that could never have been read', () => {
    expect(upsertKpiRecordInput.safeParse(body(0)).success).toBe(false);
    expect(upsertKpiRecordInput.safeParse(body(-1)).success).toBe(false);
  });
});
