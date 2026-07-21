import { expect, it } from 'vitest';
import { scoreRetrieval } from '../../fixtures/golden/ir-metrics.ts';
import { evaluateRetrievalPolicy } from '../../fixtures/golden/retrieval-policy.ts';

const relevance = { 'task-billing-001': 3, 'task-payment-001': 2, 'task-invoice-001': 1 };

it('passes when all required scorers meet threshold', () => {
  const ranked = ['task-billing-001', 'task-payment-001'];
  const score = scoreRetrieval(ranked, relevance, [1, 3, 5]);
  const result = evaluateRetrievalPolicy({
    rankedIds: ranked,
    score,
    relevance,
    decoyIds: ['decoy-999'],
  });
  expect(result.verdict).toBe('pass');
  expect(result.scorers.find((s) => s.id === 'retrieval_tenant_isolation')?.passed).toBe(true);
});

it('fails when a decoy id leaks into the ranking (tenant isolation)', () => {
  const ranked = ['decoy-999', 'task-billing-001'];
  const score = scoreRetrieval(ranked, relevance, [1, 3, 5]);
  const result = evaluateRetrievalPolicy({
    rankedIds: ranked,
    score,
    relevance,
    decoyIds: ['decoy-999'],
  });
  expect(result.verdict).toBe('fail');
});

it('fails when the top result is not grade-3 (top1_strong required)', () => {
  const ranked = ['task-invoice-001', 'task-billing-001'];
  const score = scoreRetrieval(ranked, relevance, [1, 3, 5]);
  const result = evaluateRetrievalPolicy({ rankedIds: ranked, score, relevance, decoyIds: [] });
  expect(result.verdict).toBe('fail');
});

it('advisory scorer below threshold does NOT fail the verdict', () => {
  const ranked = ['task-billing-001']; // recall@5 = 1/2 = 0.5 (< 0.8 advisory)
  const score = scoreRetrieval(ranked, relevance, [1, 3, 5]);
  const result = evaluateRetrievalPolicy({ rankedIds: ranked, score, relevance, decoyIds: [] });
  const recall = result.scorers.find((s) => s.id === 'retrieval_recall_at_k');
  expect(recall?.passed).toBe(false);
  expect(recall?.mode).toBe('advisory');
  expect(result.verdict).toBe('pass');
});
