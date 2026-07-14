import { createScorer, type MastraScorer } from '@mastra/core/evals';
import type { AgentResult } from '@seta/agent-sdk';
import { TrustEnvelopeSchema } from '@seta/agent-sdk';
import type { z } from 'zod';

/** Stable-key JSON so field order never causes a false mismatch. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

type ResultOutput = AgentResult<unknown>;

/** 1 iff AgentResult.result parses against the spec's outputSchema. */
export function schemaConformanceScorer(outputSchema: z.ZodTypeAny): MastraScorer {
  return createScorer<unknown, ResultOutput>({
    id: 'schema-conformance',
    description: 'AgentResult.result parses against the spec outputSchema',
  }).generateScore(({ run }) =>
    outputSchema.safeParse(run.output.result).success ? 1 : 0,
  ) as MastraScorer;
}

/** 1 iff AgentResult.trust is a valid TrustEnvelope (confidenceScore in [0,1], shapes valid). */
export function trustEnvelopeScorer(): MastraScorer {
  return createScorer<unknown, ResultOutput>({
    id: 'trust-envelope-validity',
    description: 'AgentResult.trust is a structurally valid TrustEnvelope',
  }).generateScore(({ run }) =>
    TrustEnvelopeSchema.safeParse(run.output.trust).success ? 1 : 0,
  ) as MastraScorer;
}

/** 1 iff groundTruth is defined and equals AgentResult.result (default deep-equal). */
export function goldenMatchScorer(opts?: {
  compare?: (actual: unknown, expected: unknown) => boolean;
}): MastraScorer {
  const eq = opts?.compare ?? ((a, b) => stableStringify(a) === stableStringify(b));
  return createScorer<unknown, ResultOutput>({
    id: 'golden-match',
    description: 'AgentResult.result equals the case groundTruth',
  }).generateScore(({ run }) =>
    run.groundTruth !== undefined && eq(run.output.result, run.groundTruth) ? 1 : 0,
  ) as MastraScorer;
}
