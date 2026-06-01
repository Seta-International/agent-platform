import { describe, expect, it } from 'vitest';
import { parseAgentEnv } from '../../src/backend/env.ts';

describe('parseAgentEnv', () => {
  it('returns defaults with AGENT_MODELS set', () => {
    const env = parseAgentEnv({ AGENT_MODELS: 'openai/gpt-5.5' });
    expect(env.AGENT_MODELS).toBe('openai/gpt-5.5');
    expect(env.AGENT_MODEL_DEFAULT).toBeUndefined();
    expect(env.AGENT_HITL_EXPIRY_SECONDS).toBe(300);
    expect(env.AGENT_RATE_LIMIT_TPM).toBe(60_000);
    expect(env.AGENT_RATE_LIMIT_TURNS_PER_MIN).toBe(10);
  });

  it('coerces numeric envs', () => {
    const env = parseAgentEnv({
      AGENT_HITL_EXPIRY_SECONDS: '2',
      AGENT_RATE_LIMIT_TPM: '500',
      AGENT_RATE_LIMIT_TURNS_PER_MIN: '3',
    });
    expect(env.AGENT_HITL_EXPIRY_SECONDS).toBe(2);
    expect(env.AGENT_RATE_LIMIT_TPM).toBe(500);
    expect(env.AGENT_RATE_LIMIT_TURNS_PER_MIN).toBe(3);
  });

  it('allows AGENT_MODELS to be unset (registry falls back to default)', () => {
    expect(parseAgentEnv({}).AGENT_MODELS).toBeUndefined();
  });
});
