import { describe, expect, it } from 'vitest';
import { computeThroughput } from '../../src/backend/llm-metrics.ts';

describe('computeThroughput', () => {
  it('computes output tokens per second over the decode window', () => {
    // 100 output tokens, first token at t=1000ms, last at t=3000ms → 2s window → 50 tok/s
    const r = computeThroughput({ outputTokens: 100, firstTokenAtMs: 1000, lastTokenAtMs: 3000 });
    expect(r.tokensPerSecond).toBeCloseTo(50, 5);
    expect(r.decodeSeconds).toBeCloseTo(2, 5);
  });

  it('returns null tok/s when the decode window is zero (single token / instant)', () => {
    const r = computeThroughput({ outputTokens: 1, firstTokenAtMs: 1000, lastTokenAtMs: 1000 });
    expect(r.tokensPerSecond).toBeNull();
  });

  it('returns null tok/s when no output tokens were produced', () => {
    const r = computeThroughput({ outputTokens: 0, firstTokenAtMs: 1000, lastTokenAtMs: 3000 });
    expect(r.tokensPerSecond).toBeNull();
  });

  it('returns null tok/s when timing is missing (stream never yielded a text delta)', () => {
    const r = computeThroughput({ outputTokens: 42 });
    expect(r.tokensPerSecond).toBeNull();
    expect(r.decodeSeconds).toBeNull();
  });
});
