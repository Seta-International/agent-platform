import { EMPTY_TRUST, SpecializedAgentRegistry, TrustEnvelopeSchema } from '@seta/agent-sdk';
import { describe, expect, it } from 'vitest';

describe('@seta/agent-sdk orchestration exports', () => {
  it('re-exports the trust contract', () => {
    expect(typeof TrustEnvelopeSchema.parse).toBe('function');
    expect(EMPTY_TRUST.confidenceScore).toBe(0);
  });

  it('re-exports the SpecializedAgentRegistry', () => {
    expect(typeof SpecializedAgentRegistry.register).toBe('function');
    expect(typeof SpecializedAgentRegistry.snapshot).toBe('function');
  });
});
