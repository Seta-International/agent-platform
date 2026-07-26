// packages/planner/tests/fixtures/golden/metric-policy.ts
//
// Central gate-vs-advisory registry (spec §D). The single source of truth for
// whether a metric BLOCKS a run (gate) or only reports (advisory) is the
// `metricPolicy` block in the agent's eval.config.json. A case may override a
// metric's mode, but only with an explicit `reason` (so overrides are auditable
// and never silent).
import { readFileSync } from 'node:fs';

export type MetricMode = 'gate' | 'advisory';

export interface MetricOverride {
  mode: MetricMode;
  reason: string;
}

interface EvalConfig {
  metricPolicy?: Record<string, { mode: MetricMode }>;
}

const CONFIG_URL = new URL(
  '../../../../../docs/agents/planner-query/eval.config.json',
  import.meta.url,
);

let cachedPolicy: Record<string, { mode: MetricMode }> | null = null;

function loadPolicy(): Record<string, { mode: MetricMode }> {
  if (cachedPolicy) return cachedPolicy;
  const config = JSON.parse(readFileSync(CONFIG_URL, 'utf8')) as EvalConfig;
  cachedPolicy = config.metricPolicy ?? {};
  return cachedPolicy;
}

/**
 * Resolves a metric's mode. A per-case `override` wins, but only when it
 * carries a non-empty `reason`; otherwise the central registry decides.
 * Throws if the metric is absent from the registry and not overridden — an
 * unknown metric must not silently default to advisory.
 */
export function resolveMetricMode(metricId: string, override?: MetricOverride): MetricMode {
  if (override && override.reason.trim().length > 0) return override.mode;
  const policy = loadPolicy();
  const entry = policy[metricId];
  if (!entry) {
    throw new Error(`metric-policy: unknown metric "${metricId}" (not in eval.config.json)`);
  }
  return entry.mode;
}
