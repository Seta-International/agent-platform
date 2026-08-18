// packages/planner/tests/fixtures/golden/action/metric-rates.ts
//
// Design D3: the A2 lane gates on a PASS RATE per metric, not on "no case failed".
//
// Why not A1's binary gate: with a self-hosted model, a binary lane over 30
// model-driven cases is red on most runs, and a lane that is always red is a lane
// nobody reads. The requirement-backed metrics (M3 BR-03, M4, M5 BR-05, M7 EV-08)
// carry a threshold of 1.00 — the same mechanism with no tolerance, not an
// exception to it.
import type { GoldenRunReport } from '../golden-eval-runner.ts';
import { resolveMetricThreshold } from '../metric-policy.ts';

export interface MetricRate {
  id: string;
  mode: 'gate' | 'advisory';
  evaluated: number;
  passed: number;
  rate: number;
  threshold: number;
  missedCases: string[];
}

/** One entry per metric ANY case claimed, sorted by id. A metric no case claimed is
 *  absent rather than 0/0. (The "every metric is claimed by ≥1 case" check is
 *  FUT-829's, and it runs on the default gate where it costs nothing.) */
export function metricRates(report: GoldenRunReport, configUrl: URL): MetricRate[] {
  const acc = new Map<string, MetricRate>();
  for (const caseReport of report.cases) {
    for (const policy of caseReport.policies) {
      const entry =
        acc.get(policy.id) ??
        ({
          id: policy.id,
          mode: policy.mode,
          evaluated: 0,
          passed: 0,
          rate: 0,
          threshold: resolveMetricThreshold(policy.id, configUrl),
          missedCases: [],
        } satisfies MetricRate);
      entry.evaluated += 1;
      if (policy.verdict === 'pass') entry.passed += 1;
      else entry.missedCases.push(caseReport.id);
      entry.rate = entry.passed / entry.evaluated;
      acc.set(policy.id, entry);
    }
  }
  return [...acc.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** The lane's gate. Throws with EVERY shortfall at once — a run that misses three
 *  metrics should report three, not the first. */
export function assertMetricThresholds(report: GoldenRunReport, configUrl: URL): MetricRate[] {
  const rates = metricRates(report, configUrl);
  const shortfalls = rates.filter((r) => r.mode === 'gate' && r.rate < r.threshold);
  if (shortfalls.length) {
    throw new Error(
      `golden action lane: metric threshold(s) missed\n${shortfalls
        .map(
          (r) =>
            `  ${r.id} ${r.rate.toFixed(2)} < ${r.threshold.toFixed(2)} ` +
            `(${r.passed}/${r.evaluated}) — missed: ${r.missedCases.join(', ')}`,
        )
        .join('\n')}`,
    );
  }
  return rates;
}
