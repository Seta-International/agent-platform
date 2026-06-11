import { describe, expect, it } from 'vitest';
import type { ChatStreamRun, OrchestrationFinal } from '../../src/types.ts';
import { RunStepPayloadSchema } from '../../src/types.ts';

describe('orchestration streaming contract', () => {
  it('OrchestrationFinal carries the assembled result and trust', () => {
    const fin: OrchestrationFinal = {
      result: { skills: ['aws'] },
      trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0.8 },
    };
    expect(fin.trust.confidenceScore).toBe(0.8);
  });

  it('ChatStreamRun exposes a Mastra stream output and a finalize closure', () => {
    const run: ChatStreamRun = {
      output: { fullStream: (async function* () {})() } as unknown as ChatStreamRun['output'],
      finalize: async () => ({
        result: {},
        trust: { reasoningTrace: [], evidenceCitations: [], confidenceScore: 0 },
      }),
    };
    expect(typeof run.finalize).toBe('function');
  });
});

describe('RunStepPayloadSchema', () => {
  it('parses a valid run-step payload', () => {
    const p = RunStepPayloadSchema.parse({
      runId: 'r1',
      orchestrationId: 'o1',
      stepIndex: 0,
      tenantId: 't1',
      actorUserId: 'u1',
    });
    expect(p.stepIndex).toBe(0);
  });

  it('rejects a negative stepIndex', () => {
    expect(() =>
      RunStepPayloadSchema.parse({
        runId: 'r1',
        orchestrationId: 'o1',
        stepIndex: -1,
        tenantId: 't1',
        actorUserId: 'u1',
      }),
    ).toThrow();
  });
});
