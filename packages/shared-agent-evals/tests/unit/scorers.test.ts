import type { AgentResult } from '@seta/agent-sdk';
import { EMPTY_TRUST } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  goldenMatchScorer,
  schemaConformanceScorer,
  trustEnvelopeScorer,
} from '../../src/scorers.ts';

const outputSchema = z.object({ a: z.string() });
const good: AgentResult<{ a: string }> = { result: { a: 'hi' }, trust: EMPTY_TRUST };
const badResult = { result: { a: 123 }, trust: EMPTY_TRUST } as unknown as AgentResult<{
  a: string;
}>;
const badTrust = {
  result: { a: 'hi' },
  trust: { confidenceScore: 2, reasoningTrace: [], evidenceCitations: [] },
} as unknown as AgentResult<{ a: string }>;

describe('deterministic scorers', () => {
  it('schema-conformance: 1 on valid result, 0 on invalid', async () => {
    const s = schemaConformanceScorer(outputSchema);
    expect(s.id).toBe('schema-conformance');
    expect((await s.run({ output: good as never })).score).toBe(1);
    expect((await s.run({ output: badResult as never })).score).toBe(0);
  });

  it('trust-envelope-validity: 1 on valid envelope, 0 when confidenceScore out of range', async () => {
    const s = trustEnvelopeScorer();
    expect((await s.run({ output: good as never })).score).toBe(1);
    expect((await s.run({ output: badTrust as never })).score).toBe(0);
  });

  it('golden-match: 1 on deep-equal, 0 on mismatch, 0 when no groundTruth', async () => {
    const s = goldenMatchScorer();
    expect((await s.run({ output: good as never, groundTruth: { a: 'hi' } as never })).score).toBe(
      1,
    );
    expect(
      (await s.run({ output: good as never, groundTruth: { a: 'nope' } as never })).score,
    ).toBe(0);
    expect((await s.run({ output: good as never })).score).toBe(0);
  });
});
