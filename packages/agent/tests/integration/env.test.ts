import { describe, expect, it } from 'vitest';
import { parseAgentEnv } from '../../src/backend/env.ts';

describe('parseAgentEnv', () => {
  it('returns defaults when only AGENT_MODEL is set', () => {
    const env = parseAgentEnv({ AGENT_MODEL: 'openai/gpt-5.4' });
    expect(env.AGENT_MODEL).toBe('openai/gpt-5.4');
    expect(env.AGENT_MODEL_BASE_URL).toBeUndefined();
    expect(env.AGENT_HITL_EXPIRY_SECONDS).toBe(300);
    expect(env.AGENT_RATE_LIMIT_TPM).toBe(60_000);
    expect(env.AGENT_RATE_LIMIT_TURNS_PER_MIN).toBe(10);
  });

  it('coerces numeric envs', () => {
    const env = parseAgentEnv({
      AGENT_MODEL: 'custom/m',
      AGENT_HITL_EXPIRY_SECONDS: '2',
      AGENT_RATE_LIMIT_TPM: '500',
      AGENT_RATE_LIMIT_TURNS_PER_MIN: '3',
    });
    expect(env.AGENT_HITL_EXPIRY_SECONDS).toBe(2);
    expect(env.AGENT_RATE_LIMIT_TPM).toBe(500);
    expect(env.AGENT_RATE_LIMIT_TURNS_PER_MIN).toBe(3);
  });

  it('throws when AGENT_MODEL_BASE_URL is invalid', () => {
    expect(() =>
      parseAgentEnv({ AGENT_MODEL: 'custom/m', AGENT_MODEL_BASE_URL: 'not-a-url' }),
    ).toThrow();
  });

  it('allows AGENT_MODEL to be unset (catalog falls back)', () => {
    const env = parseAgentEnv({});
    expect(env.AGENT_MODEL).toBeUndefined();
  });
});
