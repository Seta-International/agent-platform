// Which A2 case lands in which suite — asserted, not assumed.
//
// The corpus is only useful if the cheap suite runs the cases worth running cheaply
// and the holdout cases stay out of every suite anyone tunes against. Both are
// properties of the YAML, so both belong in a test that costs no model calls.
import { expect, it } from 'vitest';
import { ACTION_CASES_DIR, loadGoldenCases } from '../../../fixtures/golden/loader.ts';

const ids = (opts: Parameters<typeof loadGoldenCases>[0]) =>
  loadGoldenCases({ ...opts, casesDir: ACTION_CASES_DIR })
    .map((c) => c.id)
    .sort();

it('the corpus is 30 cases and every one is a conversation', () => {
  const cases = loadGoldenCases({ includeAll: true, casesDir: ACTION_CASES_DIR });
  expect(cases).toHaveLength(30);
  expect(cases.every((c) => c.kind === 'conversation')).toBe(true);
  // Ids are unique: two cases under one id would silently halve the corpus.
  expect(new Set(cases.map((c) => c.id)).size).toBe(30);
});

it('smoke is the six cheapest cases that still cover a write and a revision', () => {
  expect(ids({ suite: 'smoke' })).toEqual([
    'MU-001',
    'MU-003',
    'MU-005',
    'MU-007',
    'MU-009',
    'RV-008',
  ]);
});

it('regression is every non-holdout case', () => {
  expect(ids({ suite: 'regression' })).toHaveLength(25);
  expect(ids({ suite: 'regression' })).not.toContain('MU-017');
});

it('nightly is exactly the five holdout cases, and only with includeHoldout', () => {
  expect(ids({ suite: 'nightly' })).toEqual([]);
  expect(ids({ suite: 'nightly', includeHoldout: true })).toEqual([
    'MU-017',
    'MU-020',
    'MU-021',
    'RV-004',
    'RV-006',
  ]);
});

it('no case hard-codes a uuid — every row reference goes through a fixture name', () => {
  const raw = JSON.stringify(loadGoldenCases({ includeAll: true, casesDir: ACTION_CASES_DIR }));
  expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
});
