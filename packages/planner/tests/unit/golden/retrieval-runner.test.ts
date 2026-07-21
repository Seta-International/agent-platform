import { expect, it } from 'vitest';
import { runRetrievalCases } from '../../fixtures/golden/retrieval-runner.ts';
import type { GoldenCase } from '../../fixtures/golden/schema.ts';

const caseA: GoldenCase = {
  schemaVersion: 1,
  kind: 'retrieval',
  id: 'RET-TEST-001',
  suites: ['nightly'],
  holdout: false,
  tags: [],
  query: 'billing migration',
  tenantId: 'tenant-golden-main',
  relevance: { 'task-billing-001': 3, 'task-payment-001': 2 },
  evaluation: { k: [1, 3, 5] },
};

it('scores each retrieval case via the injected search and returns a verdict', async () => {
  const results = await runRetrievalCases({
    cases: [caseA],
    decoyIds: [],
    search: async (query, tenantId) => {
      expect(query).toBe('billing migration');
      expect(tenantId).toBe('tenant-golden-main');
      return ['task-billing-001', 'task-payment-001'];
    },
  });
  expect(results).toHaveLength(1);
  expect(results[0]!.id).toBe('RET-TEST-001');
  expect(results[0]!.policy.verdict).toBe('pass');
  expect(results[0]!.score.mrr).toBe(1);
});

it('ignores non-retrieval cases', async () => {
  const agentCase = { ...caseA, kind: 'agent' } as unknown as GoldenCase;
  const results = await runRetrievalCases({
    cases: [agentCase],
    decoyIds: [],
    search: async () => [],
  });
  expect(results).toHaveLength(0);
});
