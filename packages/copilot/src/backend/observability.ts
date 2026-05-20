type Counter = { add: (n: number, attrs?: Record<string, string>) => void };
type Histogram = { record: (n: number, attrs?: Record<string, string>) => void };

const noopCounter: Counter = { add: () => undefined };
const noopHistogram: Histogram = { record: () => undefined };

export const otel = {
  agentCacheHit: noopCounter,
  agentCacheMiss: noopCounter,
  toolDurationMs: noopHistogram,
  hitlOutcome: noopCounter,
  rateLimitExceeded: noopCounter,
  modelTokenIn: noopCounter,
  modelTokenOut: noopCounter,
  chatTurnDurationMs: noopHistogram,
};

export function bindOtel(impl: Partial<typeof otel>): void {
  Object.assign(otel, impl);
}
