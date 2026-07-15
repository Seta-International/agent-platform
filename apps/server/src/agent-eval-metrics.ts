import { type BatchObservableResult, metrics } from '@opentelemetry/api';
import type { LatestScores } from '@seta/core/agent-eval';

export interface Observation {
  value: number;
  attributes: Record<string, string>;
}

/** Pure: one gauge observation per score row. */
export function scoreObservations(cache: LatestScores | null): Observation[] {
  if (!cache) return [];
  return cache.rows.map((r) => ({
    value: r.score,
    attributes: {
      specialist_id: r.specialistId,
      scorer_id: r.scorerId,
      layer: r.layer,
      model_tier: r.modelTier,
    },
  }));
}

/** Pure: unix seconds of the latest completed run, or null. */
export function freshnessObservation(cache: LatestScores | null): number | null {
  return cache?.lastRunFinishedAt ? Math.floor(cache.lastRunFinishedAt.getTime() / 1000) : null;
}

export interface AgentEvalMetricsDeps {
  readLatest: () => Promise<LatestScores>;
  logger?: { warn: (obj: unknown, msg?: string) => void };
  refreshMs?: number;
}

/** Refreshable in-memory snapshot of the latest scores. Refresh errors hold the last value. */
export function makeAgentEvalMetricsState(deps: AgentEvalMetricsDeps) {
  let cache: LatestScores | null = null;
  return {
    async refresh(): Promise<void> {
      try {
        cache = await deps.readLatest();
      } catch (err) {
        deps.logger?.warn({ err }, 'agent-eval metrics refresh failed; keeping last snapshot');
      }
    },
    snapshot: (): LatestScores | null => cache,
  };
}

const DEFAULT_REFRESH_MS = 10 * 60 * 1000;

/** Register the OTel observable gauges + start the refresh loop. */
export function initAgentEvalMetrics(deps: AgentEvalMetricsDeps): { stop: () => void } {
  const state = makeAgentEvalMetricsState(deps);
  const meter = metrics.getMeter('@seta/server/agent-eval');
  const scoreGauge = meter.createObservableGauge('agent_eval_score', {
    description: 'Latest advisory judge score per specialist×scorer (0–1).',
  });
  const freshnessGauge = meter.createObservableGauge('agent_eval_last_run_timestamp_seconds', {
    description: 'Unix seconds of the latest completed agent-quality eval run.',
  });

  const callback = (obs: BatchObservableResult) => {
    const cache = state.snapshot();
    for (const o of scoreObservations(cache)) obs.observe(scoreGauge, o.value, o.attributes);
    const fresh = freshnessObservation(cache);
    if (fresh !== null) obs.observe(freshnessGauge, fresh);
  };
  meter.addBatchObservableCallback(callback, [scoreGauge, freshnessGauge]);

  void state.refresh(); // prime immediately
  const timer = setInterval(() => void state.refresh(), deps.refreshMs ?? DEFAULT_REFRESH_MS);
  timer.unref?.();

  return {
    stop() {
      clearInterval(timer);
      meter.removeBatchObservableCallback(callback, [scoreGauge, freshnessGauge]);
    },
  };
}
