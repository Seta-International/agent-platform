import { describe, expect, it } from 'vitest';
import { parseAgentEnv } from '../../src/backend/env.ts';

describe('parseAgentEnv — tool execution timeout fields', () => {
  it('applies documented defaults when none of the new vars are set', () => {
    const env = parseAgentEnv({});
    expect(env.AGENT_TOOL_TIMEOUT_READ_MS).toBe(30_000);
    expect(env.AGENT_TOOL_TIMEOUT_WRITE_MS).toBe(60_000);
    expect(env.AGENT_TOOL_TIMEOUT_MAX_MS).toBe(300_000);
    expect(env.AGENT_TOOL_BREAKER_FAILURE_THRESHOLD).toBe(3);
    expect(env.AGENT_TOOL_BREAKER_OPEN_MS).toBe(60_000);
  });

  it('coerces numeric strings (env vars always arrive as strings)', () => {
    const env = parseAgentEnv({
      AGENT_TOOL_TIMEOUT_READ_MS: '45000',
      AGENT_TOOL_TIMEOUT_WRITE_MS: '90000',
      AGENT_TOOL_TIMEOUT_MAX_MS: '600000',
      AGENT_TOOL_BREAKER_FAILURE_THRESHOLD: '5',
      AGENT_TOOL_BREAKER_OPEN_MS: '120000',
    });
    expect(env.AGENT_TOOL_TIMEOUT_READ_MS).toBe(45_000);
    expect(env.AGENT_TOOL_TIMEOUT_WRITE_MS).toBe(90_000);
    expect(env.AGENT_TOOL_TIMEOUT_MAX_MS).toBe(600_000);
    expect(env.AGENT_TOOL_BREAKER_FAILURE_THRESHOLD).toBe(5);
    expect(env.AGENT_TOOL_BREAKER_OPEN_MS).toBe(120_000);
  });

  it('rejects zero / negative values for all timeout and threshold fields', () => {
    for (const key of [
      'AGENT_TOOL_TIMEOUT_READ_MS',
      'AGENT_TOOL_TIMEOUT_WRITE_MS',
      'AGENT_TOOL_TIMEOUT_MAX_MS',
      'AGENT_TOOL_BREAKER_FAILURE_THRESHOLD',
      'AGENT_TOOL_BREAKER_OPEN_MS',
    ] as const) {
      expect(() => parseAgentEnv({ [key]: '0' })).toThrow();
      expect(() => parseAgentEnv({ [key]: '-1' })).toThrow();
    }
  });
});

describe('parseAgentEnv — memory fields', () => {
  it('defaults AGENT_MEMORY_LAST_MESSAGES to 20', () => {
    const env = parseAgentEnv({});
    expect(env.AGENT_MEMORY_LAST_MESSAGES).toBe(20);
  });

  it('coerces AGENT_MEMORY_LAST_MESSAGES from string', () => {
    const env = parseAgentEnv({ AGENT_MEMORY_LAST_MESSAGES: '40' });
    expect(env.AGENT_MEMORY_LAST_MESSAGES).toBe(40);
  });

  it('rejects zero for AGENT_MEMORY_LAST_MESSAGES', () => {
    expect(() => parseAgentEnv({ AGENT_MEMORY_LAST_MESSAGES: '0' })).toThrow();
  });
});
