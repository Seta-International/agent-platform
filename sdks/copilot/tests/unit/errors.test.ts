import { describe, expect, it } from 'vitest';
import { ToolBreakerOpenError, ToolExecutionTimeoutError } from '../../src/errors';

describe('ToolExecutionTimeoutError', () => {
  it('carries toolId, timeoutMs, fixed code, and serializes to a tool-result-friendly payload', () => {
    const err = new ToolExecutionTimeoutError('planner.searchTasksSemantic', 30_000);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ToolExecutionTimeoutError');
    expect(err.code).toBe('tool_execution_timeout');
    expect(err.toolId).toBe('planner.searchTasksSemantic');
    expect(err.timeoutMs).toBe(30_000);
    expect(err.message).toContain('planner.searchTasksSemantic');
    expect(err.message).toContain('30000');
    expect(err.toJSON()).toEqual({
      ok: false,
      code: 'tool_execution_timeout',
      message: err.message,
      toolId: 'planner.searchTasksSemantic',
      timeoutMs: 30_000,
    });
  });
});

describe('ToolBreakerOpenError', () => {
  it('carries toolId, openUntil ISO string, fixed code, and serializes', () => {
    const openUntil = Date.parse('2026-05-26T10:00:00.000Z');
    const err = new ToolBreakerOpenError('planner.assignTask', openUntil);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ToolBreakerOpenError');
    expect(err.code).toBe('tool_breaker_open');
    expect(err.toolId).toBe('planner.assignTask');
    expect(err.openUntil).toBe(openUntil);
    expect(err.message).toContain('planner.assignTask');
    expect(err.toJSON()).toEqual({
      ok: false,
      code: 'tool_breaker_open',
      message: err.message,
      toolId: 'planner.assignTask',
      openUntil: '2026-05-26T10:00:00.000Z',
    });
  });
});
