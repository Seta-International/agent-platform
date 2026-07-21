import { expect, it } from 'vitest';
import { scoreRetrieval } from '../../fixtures/golden/ir-metrics.ts';

const relevance = {
  'task-billing-001': 3,
  'task-payment-001': 2,
  'task-invoice-001': 1,
  'task-analytics-001': 0,
};

it('perfect ranking scores MRR=1 and top-1 strong', () => {
  const r = scoreRetrieval(['task-billing-001', 'task-payment-001'], relevance, [1, 3, 5]);
  expect(r.mrr).toBe(1);
  expect(r.top1Strong).toBe(true);
});

it('unlabeled returned task is treated as grade 0', () => {
  const r = scoreRetrieval(['task-unknown-999'], relevance, [1]);
  expect(r.recallAtK[1]).toBe(0);
  expect(r.mrr).toBe(0);
});

it('empty result yields recall=MRR=nDCG=0', () => {
  const r = scoreRetrieval([], relevance, [3]);
  expect(r.recallAtK[3]).toBe(0);
  expect(r.ndcgAtK[3]).toBe(0);
});
