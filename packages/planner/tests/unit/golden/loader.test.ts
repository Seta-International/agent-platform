import { expect, it } from 'vitest';
import {
  ACTION_CASES_DIR,
  loadGoldenCases,
  QUERY_CASES_DIR,
  resolveFactRef,
  toEvalCase,
} from '../../fixtures/golden/loader.ts';

it('selects by suite and always excludes holdout by default', () => {
  const smoke = loadGoldenCases({ suite: 'smoke' });
  expect(smoke.every((c) => c.suites.includes('smoke') && c.holdout === false)).toBe(true);
});

it('loads authored kind:retrieval cases with a non-empty relevance map', () => {
  const retrieval = loadGoldenCases({ includeAll: true }).filter((c) => c.kind === 'retrieval');
  expect(retrieval.length).toBeGreaterThan(0);
  for (const c of retrieval) {
    if (c.kind !== 'retrieval') continue;
    expect(Object.keys(c.relevance).length).toBeGreaterThan(0);
    expect(c.query.length).toBeGreaterThan(0);
  }
});

it('resolves a fact ref against golden-facts.json', () => {
  expect(resolveFactRef('facts.users.00000000-bbbb-4000-8000-000000000002.openTaskCount')).toBe(12);
});

it('throws on an unknown fact ref (no silent undefined)', () => {
  expect(() => resolveFactRef('facts.users.nope.openTaskCount')).toThrow();
});

it('down-projects an agent case to an EvalCase with resolved facts as groundTruth', () => {
  const evalCase = toEvalCase({
    schemaVersion: 1,
    kind: 'agent',
    id: 'PQ-FACT-001',
    category: 'factual',
    suites: ['smoke'],
    holdout: false,
    tags: [],
    actor: { tenantId: 'tenant-golden-main', userId: 'actor-standard-001' },
    input: { messages: [{ role: 'user', content: 'How many open tasks does Tuan have?' }] },
    expected: {
      behavior: 'answer',
      facts: [
        {
          ref: 'facts.users.00000000-bbbb-4000-8000-000000000002.openTaskCount',
          assertion: 'equals',
        },
      ],
    },
    metrics: { enabled: ['A1'] },
  });
  expect(evalCase.name).toBe('PQ-FACT-001');
  expect(evalCase.layer).toBe('deterministic');
  expect(evalCase.actor).toEqual({ tenantId: 'tenant-golden-main', userId: 'actor-standard-001' });
  expect(evalCase.groundTruth).toMatchObject({
    'facts.users.00000000-bbbb-4000-8000-000000000002.openTaskCount': 12,
  });
});

it('defaults to the A1 dataset and can be pointed at the A2 dataset', () => {
  const a1 = loadGoldenCases({ includeAll: true });
  const explicit = loadGoldenCases({ includeAll: true, casesDir: QUERY_CASES_DIR });
  expect(explicit.map((c) => c.id)).toEqual(a1.map((c) => c.id));

  // The A2 directory may be empty until Part 4 authors it; what must hold is
  // that pointing at it returns something DISJOINT from A1 rather than A1 again.
  const a2 = loadGoldenCases({ includeAll: true, casesDir: ACTION_CASES_DIR });
  const a1Ids = new Set(a1.map((c) => c.id));
  expect(a2.some((c) => a1Ids.has(c.id))).toBe(false);
});
