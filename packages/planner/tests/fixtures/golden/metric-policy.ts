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

interface MetricEntry {
  mode: MetricMode;
  /** Minimum pass RATE across the cases that claim this metric. Absent ⇒ 1: A1's
   *  binary gate is the same rule with no tolerance. */
  threshold?: number;
}

interface EvalConfig {
  metricPolicy?: Record<string, MetricEntry>;
  readTools?: string[];
}

export const QUERY_CONFIG_URL = new URL(
  '../../../../../docs/agents/planner-query/eval.config.json',
  import.meta.url,
);
export const ACTION_CONFIG_URL = new URL(
  '../../../../../docs/agents/planner-action/eval.config.json',
  import.meta.url,
);

// Keyed by URL string: two agents, two configs, one process (the corpus
// self-tests in FUT-829 read both in the same run).
const cache = new Map<string, Record<string, MetricEntry>>();

function loadPolicy(url: URL): Record<string, MetricEntry> {
  const key = url.href;
  const hit = cache.get(key);
  if (hit) return hit;
  const config = JSON.parse(readFileSync(url, 'utf8')) as EvalConfig;
  const policy = config.metricPolicy ?? {};
  cache.set(key, policy);
  return policy;
}

function entry(metricId: string, url: URL): MetricEntry {
  const found = loadPolicy(url)[metricId];
  if (!found) {
    throw new Error(`metric-policy: unknown metric "${metricId}" (not in ${url.pathname})`);
  }
  return found;
}

/**
 * Resolves a metric's mode. A per-case `override` wins, but only when it carries
 * a non-empty `reason`; otherwise the named agent config decides. Throws if the
 * metric is absent and not overridden — an unknown metric must not silently
 * default to advisory.
 */
export function resolveMetricMode(
  metricId: string,
  override?: MetricOverride,
  configUrl: URL = QUERY_CONFIG_URL,
): MetricMode {
  if (override && override.reason.trim().length > 0) return override.mode;
  return entry(metricId, configUrl).mode;
}

/** The metric's minimum pass rate. 1 when the config declares none. */
export function resolveMetricThreshold(
  metricId: string,
  configUrl: URL = QUERY_CONFIG_URL,
): number {
  return entry(metricId, configUrl).threshold ?? 1;
}

const readToolsCache = new Map<string, string[]>();

/**
 * The agent's read-only tools, as its own eval.config.json declares them.
 *
 * Resolving "Deploy API" or "Tuấn" to an id is plumbing that nearly every case
 * needs and that no case should have to re-list — the corpus declares 28
 * `requiredTools` lists and not one `allowedTools`, which is the corpus saying so.
 * `tool_selection` therefore permits these implicitly. The two mechanisms that still
 * bite are the ones that mean something: `maxToolCalls` bounds how MANY calls a turn
 * may make, and `forbiddenTools` prohibits a specific tool outright.
 */
export function resolveReadTools(configUrl: URL = QUERY_CONFIG_URL): string[] {
  const key = configUrl.href;
  const hit = readToolsCache.get(key);
  if (hit) return hit;
  const config = JSON.parse(readFileSync(configUrl, 'utf8')) as EvalConfig;
  const tools = config.readTools ?? [];
  readToolsCache.set(key, tools);
  return tools;
}
