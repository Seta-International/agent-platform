import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('@seta/agent/llm');

// Output throughput of a single chat turn's decode phase (first → last token).
// Labelled by {tenant, model} — both bounded cardinality, safe for Prometheus.
// user_id is intentionally omitted (unbounded) — per-user attribution belongs in
// a DB read model, not a metric label.
const throughputHistogram = meter.createHistogram('agent_llm_output_tokens_per_second', {
  description: 'Output tokens per second over a chat turn decode window (first→last token)',
  unit: '{token}/s',
});

const ttftHistogram = meter.createHistogram('agent_llm_ttft_seconds', {
  description: 'Time to first output token of a chat turn',
  unit: 's',
});

const outputTokensCounter = meter.createCounter('agent_llm_output_tokens_total', {
  description: 'Total output (completion) tokens generated, per tenant/model',
});

const promptTokensCounter = meter.createCounter('agent_llm_prompt_tokens_total', {
  description: 'Total prompt (input) tokens consumed, per tenant/model',
});

export interface ThroughputInput {
  outputTokens: number;
  /** `performance.now()` (ms) when the first text delta was observed. */
  firstTokenAtMs?: number;
  /** `performance.now()` (ms) when the last text delta was observed. */
  lastTokenAtMs?: number;
}

export interface ThroughputResult {
  /** Decode-window length in seconds, or null if it can't be measured. */
  decodeSeconds: number | null;
  /** Output tokens / decode seconds, or null when undefined (no tokens / no window). */
  tokensPerSecond: number | null;
}

/**
 * tok/s of the decode phase: output tokens divided by the wall time from the
 * first to the last streamed text delta. Returns null tok/s when it can't be
 * meaningfully computed (no tokens, no timing, or an instantaneous window) so
 * callers never record a divide-by-zero or Infinity sample.
 */
export function computeThroughput(input: ThroughputInput): ThroughputResult {
  const { outputTokens, firstTokenAtMs, lastTokenAtMs } = input;
  if (firstTokenAtMs === undefined || lastTokenAtMs === undefined) {
    return { decodeSeconds: null, tokensPerSecond: null };
  }
  const decodeSeconds = (lastTokenAtMs - firstTokenAtMs) / 1_000;
  if (decodeSeconds <= 0 || outputTokens <= 0) {
    return { decodeSeconds, tokensPerSecond: null };
  }
  return { decodeSeconds, tokensPerSecond: outputTokens / decodeSeconds };
}

export interface RecordLlmTurnInput extends ThroughputInput {
  tenantId: string;
  /** Catalog model key, e.g. `vllm/Qwen3-8B` — the metric `model` label. */
  model: string;
  inputTokens: number;
  /** `performance.now()` (ms) at turn start, to derive time-to-first-token. */
  turnStartAtMs?: number;
}

/**
 * Record a completed chat turn's LLM usage as OpenTelemetry metrics, surfaced on
 * the existing Prometheus `/metrics` endpoint. Best-effort: never throws into the
 * chat path.
 */
export function recordLlmTurn(input: RecordLlmTurnInput): void {
  try {
    const attrs = { tenant: input.tenantId, model: input.model };
    if (input.inputTokens > 0) promptTokensCounter.add(input.inputTokens, attrs);
    if (input.outputTokens > 0) outputTokensCounter.add(input.outputTokens, attrs);

    const { tokensPerSecond } = computeThroughput(input);
    if (tokensPerSecond !== null) throughputHistogram.record(tokensPerSecond, attrs);

    if (input.turnStartAtMs !== undefined && input.firstTokenAtMs !== undefined) {
      const ttftSeconds = (input.firstTokenAtMs - input.turnStartAtMs) / 1_000;
      if (ttftSeconds >= 0) ttftHistogram.record(ttftSeconds, attrs);
    }
  } catch {
    // Metrics are observability, never load-bearing — swallow.
  }
}
