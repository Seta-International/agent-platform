import { describe, expect, it } from 'vitest';
import { parseCopilotEnv } from '../../src/backend/env.ts';

describe('parseCopilotEnv — tool execution timeout fields', () => {
  it('applies documented defaults when none of the new vars are set', () => {
    const env = parseCopilotEnv({});
    expect(env.COPILOT_TOOL_TIMEOUT_READ_MS).toBe(30_000);
    expect(env.COPILOT_TOOL_TIMEOUT_WRITE_MS).toBe(60_000);
    expect(env.COPILOT_TOOL_TIMEOUT_MAX_MS).toBe(300_000);
    expect(env.COPILOT_TOOL_BREAKER_FAILURE_THRESHOLD).toBe(3);
    expect(env.COPILOT_TOOL_BREAKER_OPEN_MS).toBe(60_000);
  });

  it('coerces numeric strings (env vars always arrive as strings)', () => {
    const env = parseCopilotEnv({
      COPILOT_TOOL_TIMEOUT_READ_MS: '45000',
      COPILOT_TOOL_TIMEOUT_WRITE_MS: '90000',
      COPILOT_TOOL_TIMEOUT_MAX_MS: '600000',
      COPILOT_TOOL_BREAKER_FAILURE_THRESHOLD: '5',
      COPILOT_TOOL_BREAKER_OPEN_MS: '120000',
    });
    expect(env.COPILOT_TOOL_TIMEOUT_READ_MS).toBe(45_000);
    expect(env.COPILOT_TOOL_TIMEOUT_WRITE_MS).toBe(90_000);
    expect(env.COPILOT_TOOL_TIMEOUT_MAX_MS).toBe(600_000);
    expect(env.COPILOT_TOOL_BREAKER_FAILURE_THRESHOLD).toBe(5);
    expect(env.COPILOT_TOOL_BREAKER_OPEN_MS).toBe(120_000);
  });

  it('rejects zero / negative values for all timeout and threshold fields', () => {
    for (const key of [
      'COPILOT_TOOL_TIMEOUT_READ_MS',
      'COPILOT_TOOL_TIMEOUT_WRITE_MS',
      'COPILOT_TOOL_TIMEOUT_MAX_MS',
      'COPILOT_TOOL_BREAKER_FAILURE_THRESHOLD',
      'COPILOT_TOOL_BREAKER_OPEN_MS',
    ] as const) {
      expect(() => parseCopilotEnv({ [key]: '0' })).toThrow();
      expect(() => parseCopilotEnv({ [key]: '-1' })).toThrow();
    }
  });
});
