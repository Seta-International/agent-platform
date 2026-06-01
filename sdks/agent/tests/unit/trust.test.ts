import { describe, expect, it } from 'vitest';
import { EMPTY_TRUST, TrustEnvelopeSchema } from '../../src/trust.ts';

describe('TrustEnvelopeSchema', () => {
  it('accepts a well-formed envelope', () => {
    const ok = TrustEnvelopeSchema.parse({
      reasoningTrace: [
        { step: 'vector_search', detail: 'top-5 by cosine', at: '2026-06-01T00:00:00.000Z' },
      ],
      evidenceCitations: [{ kind: 'user', id: 'u1', label: 'Alice', score: 0.92 }],
      confidenceScore: 0.8,
    });
    expect(ok.confidenceScore).toBe(0.8);
    expect(ok.evidenceCitations[0]!.kind).toBe('user');
  });

  it('rejects confidenceScore above 1', () => {
    expect(() =>
      TrustEnvelopeSchema.parse({
        reasoningTrace: [],
        evidenceCitations: [],
        confidenceScore: 1.5,
      }),
    ).toThrow();
  });

  it('rejects an unknown citation kind', () => {
    expect(() =>
      TrustEnvelopeSchema.parse({
        reasoningTrace: [],
        evidenceCitations: [{ kind: 'bogus', id: 'x' }],
        confidenceScore: 0.5,
      }),
    ).toThrow();
  });

  it('EMPTY_TRUST is a valid empty envelope', () => {
    expect(() => TrustEnvelopeSchema.parse(EMPTY_TRUST)).not.toThrow();
    expect(EMPTY_TRUST.confidenceScore).toBe(0);
  });
});
