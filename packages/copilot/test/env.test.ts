import { describe, expect, it } from 'vitest';
import { parseCopilotEnv } from '../src/backend/env.ts';

describe('parseCopilotEnv', () => {
  it('returns defaults when only COPILOT_MODEL is set', () => {
    const env = parseCopilotEnv({ COPILOT_MODEL: 'openai/gpt-5.4' });
    expect(env.COPILOT_MODEL).toBe('openai/gpt-5.4');
    expect(env.COPILOT_MODEL_BASE_URL).toBeUndefined();
    expect(env.COPILOT_HITL_EXPIRY_SECONDS).toBe(300);
    expect(env.COPILOT_RATE_LIMIT_TPM).toBe(60_000);
    expect(env.COPILOT_RATE_LIMIT_TURNS_PER_MIN).toBe(10);
  });

  it('coerces numeric envs', () => {
    const env = parseCopilotEnv({
      COPILOT_MODEL: 'custom/m',
      COPILOT_HITL_EXPIRY_SECONDS: '2',
      COPILOT_RATE_LIMIT_TPM: '500',
      COPILOT_RATE_LIMIT_TURNS_PER_MIN: '3',
    });
    expect(env.COPILOT_HITL_EXPIRY_SECONDS).toBe(2);
    expect(env.COPILOT_RATE_LIMIT_TPM).toBe(500);
    expect(env.COPILOT_RATE_LIMIT_TURNS_PER_MIN).toBe(3);
  });

  it('throws when COPILOT_MODEL_BASE_URL is invalid', () => {
    expect(() =>
      parseCopilotEnv({ COPILOT_MODEL: 'custom/m', COPILOT_MODEL_BASE_URL: 'not-a-url' }),
    ).toThrow();
  });

  it('throws when COPILOT_MODEL is missing', () => {
    expect(() => parseCopilotEnv({})).toThrow();
  });
});
