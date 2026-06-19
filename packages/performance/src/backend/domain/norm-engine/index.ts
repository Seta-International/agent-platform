import type { NormResult, NormRuleResult, ProfileSnapshot, RiskLevel } from '../schemas.ts';
import { evaluateLayerA } from './rules-layer-a.ts';

export { evaluateLayerA } from './rules-layer-a.ts';
export type { NormCategory, NormResult, NormRuleResult, RiskLevel } from './types.ts';

function isTriggered(results: NormRuleResult[], ruleId: string): boolean {
  return results.some((r) => r.ruleId === ruleId && r.triggered);
}

function anyTriggered(results: NormRuleResult[], ruleIds: readonly string[]): boolean {
  return results.some((r) => r.triggered && ruleIds.includes(r.ruleId));
}

// Risk-bearing rules only. Positive classifications (Excellent, Fully Compliant,
// Clear, Strong Attendance, etc.) never raise the composite level.
const MEDIUM_RISK_RULES = [
  'NORM-K04',
  'NORM-A01',
  'NORM-V02',
  'NORM-AT01',
  'NORM-AT02',
  'NORM-AT03',
];
const LOW_RISK_RULES = ['NORM-T01', 'NORM-T02', 'NORM-T03', 'NORM-V03', 'NORM-A03', 'NORM-A04'];

/**
 * Deterministic composite-risk baseline, derived purely from Layer A's triggered
 * set. This is the floor the LLM Layer B refines in the full design; in this
 * draft it is the value surfaced directly. Intentionally conservative.
 */
function compositeRiskBaseline(layerA: NormRuleResult[]): RiskLevel {
  const atRisk = isTriggered(layerA, 'NORM-K05');
  const overloaded = isTriggered(layerA, 'NORM-A01');
  const critical = isTriggered(layerA, 'NORM-V01');

  if (atRisk && (overloaded || critical)) return 'critical';
  if (atRisk || critical) return 'high';
  if (anyTriggered(layerA, MEDIUM_RISK_RULES)) return 'medium';
  if (anyTriggered(layerA, LOW_RISK_RULES)) return 'low';
  return 'none';
}

/**
 * Run the NORM engine over an assembled profile. Layer A only (deterministic);
 * Layer B (LLM composite reasoning) is omitted in this draft — the main agent
 * reasons about composite risk from `classifiedFacts`, which carry
 * classifications only, never raw numeric values.
 */
export function evaluateNormRules(profile: ProfileSnapshot): NormResult {
  const layerA = evaluateLayerA(profile);
  const classifiedFacts = layerA
    .filter((r) => r.triggered)
    .map((r) => `${r.ruleId} (${r.category}): ${r.classification}`);

  return {
    layerA,
    compositeRiskBaseline: compositeRiskBaseline(layerA),
    classifiedFacts,
    verificationPassed: true,
  };
}
