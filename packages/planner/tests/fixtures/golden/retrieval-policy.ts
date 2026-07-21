// packages/planner/tests/fixtures/golden/retrieval-policy.ts
//
// A3 (Retrieval) policy evaluator. Turns a frozen RetrievalScore (ir-metrics.ts)
// plus the ranked ids into a per-scorer pass/fail verdict, per the two-tier
// registry semantics in the design spec (Part 3): a REQUIRED scorer below its
// threshold fails the policy; an ADVISORY scorer is recorded but never blocks.
import type { RetrievalScore } from './ir-metrics.ts';

export type ThresholdOperator = 'eq' | 'gte' | 'lte';

export interface ScorerRule {
  id: string;
  required: boolean;
  mode: 'gate' | 'advisory';
  operator: ThresholdOperator;
  value: number;
  k?: number; // k to read from recallAtK/ndcgAtK; omit for scalar scorers
}

export const A3_SCORER_RULES: ScorerRule[] = [
  { id: 'retrieval_tenant_isolation', required: true, mode: 'gate', operator: 'eq', value: 1 },
  { id: 'retrieval_top1_strong', required: true, mode: 'gate', operator: 'eq', value: 1 },
  { id: 'retrieval_mrr', required: true, mode: 'gate', operator: 'gte', value: 0.8 },
  {
    id: 'retrieval_ndcg_at_k',
    required: false,
    mode: 'advisory',
    operator: 'gte',
    value: 0.75,
    k: 3,
  },
  {
    id: 'retrieval_recall_at_k',
    required: false,
    mode: 'advisory',
    operator: 'gte',
    value: 0.8,
    k: 5,
  },
];

export interface ScorerOutcome {
  id: string;
  value: number;
  required: boolean;
  mode: 'gate' | 'advisory';
  passed: boolean;
}

export interface RetrievalPolicyResult {
  verdict: 'pass' | 'fail';
  scorers: ScorerOutcome[];
}

export interface EvaluateRetrievalPolicyParams {
  rankedIds: string[];
  score: RetrievalScore;
  relevance: Record<string, number>;
  decoyIds: string[];
  rules?: ScorerRule[];
}

function scorerValue(
  rule: ScorerRule,
  rankedIds: string[],
  score: RetrievalScore,
  decoyIds: string[],
): number {
  switch (rule.id) {
    case 'retrieval_tenant_isolation': {
      const decoy = new Set(decoyIds);
      return rankedIds.some((id) => decoy.has(id)) ? 0 : 1;
    }
    case 'retrieval_top1_strong':
      return score.top1Strong ? 1 : 0;
    case 'retrieval_mrr':
      return score.mrr;
    case 'retrieval_ndcg_at_k':
      return score.ndcgAtK[rule.k ?? 3] ?? 0;
    case 'retrieval_recall_at_k':
      return score.recallAtK[rule.k ?? 5] ?? 0;
    default:
      throw new Error(`retrieval-policy: unknown scorer "${rule.id}"`);
  }
}

function meets(operator: ThresholdOperator, actual: number, target: number): boolean {
  if (operator === 'eq') return actual === target;
  if (operator === 'gte') return actual >= target;
  return actual <= target;
}

export function evaluateRetrievalPolicy(
  params: EvaluateRetrievalPolicyParams,
): RetrievalPolicyResult {
  const rules = params.rules ?? A3_SCORER_RULES;
  const scorers: ScorerOutcome[] = rules.map((rule) => {
    const value = scorerValue(rule, params.rankedIds, params.score, params.decoyIds);
    return {
      id: rule.id,
      value,
      required: rule.required,
      mode: rule.mode,
      passed: meets(rule.operator, value, rule.value),
    };
  });
  const verdict = scorers.every((s) => !s.required || s.passed) ? 'pass' : 'fail';
  return { verdict, scorers };
}
