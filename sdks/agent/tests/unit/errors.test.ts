import { describe, expect, it } from 'vitest';
import { AgentToolError, ToolBreakerOpenError, ToolExecutionTimeoutError } from '../../src/errors';

describe('AgentToolError', () => {
  it('sets .message to userMessage so Mastra only sees the safe string', () => {
    const e = new AgentToolError({
      code: 'NOT_FOUND',
      retryable: false,
      userMessage: 'Resource not found.',
      internalDetail: 'row id=abc-123 missing from planner.tasks',
      toolId: 'planner_getTask',
    });
    expect(e.message).toBe('Resource not found.');
    expect(e.userMessage).toBe('Resource not found.');
    expect(e.internalDetail).toBe('row id=abc-123 missing from planner.tasks');
    expect(e.code).toBe('NOT_FOUND');
    expect(e.retryable).toBe(false);
    expect(e.toolId).toBe('planner_getTask');
    expect(e.name).toBe('AgentToolError');
    expect(e).toBeInstanceOf(Error);
  });
});

describe('ToolExecutionTimeoutError', () => {
  it('extends AgentToolError with code TIMEOUT', () => {
    const e = new ToolExecutionTimeoutError('planner_getTask', 30_000);
    expect(e).toBeInstanceOf(AgentToolError);
    expect(e.code).toBe('TIMEOUT');
    expect(e.retryable).toBe(true);
    expect(e.toolId).toBe('planner_getTask');
    expect(e.timeoutMs).toBe(30_000);
    expect(e.message).toBe(e.userMessage);
    expect(e.name).toBe('ToolExecutionTimeoutError');
  });
});

describe('ToolBreakerOpenError', () => {
  it('extends AgentToolError with code CIRCUIT_OPEN', () => {
    const openUntil = Date.now() + 60_000;
    const e = new ToolBreakerOpenError('planner_getTask', openUntil);
    expect(e).toBeInstanceOf(AgentToolError);
    expect(e.code).toBe('CIRCUIT_OPEN');
    expect(e.retryable).toBe(true);
    expect(e.toolId).toBe('planner_getTask');
    expect(e.openUntil).toBe(openUntil);
    expect(e.message).toBe(e.userMessage);
    expect(e.name).toBe('ToolBreakerOpenError');
  });
});
