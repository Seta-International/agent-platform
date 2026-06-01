import { describe, expect, it } from 'vitest';
import { RunStepPayloadSchema } from '../../src/types.ts';

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
