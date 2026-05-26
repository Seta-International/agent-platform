import { describe, expect, it } from 'vitest';
import {
  CopilotToolError,
  ToolBreakerOpenError,
  ToolExecutionTimeoutError,
} from '../../src/errors';

describe('CopilotToolError', () => {
  it('sets .message to userMessage so Mastra only sees the safe string', () => {
    const e = new CopilotToolError({
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
    expect(e.name).toBe('CopilotToolError');
    expect(e).toBeInstanceOf(Error);
  });
});

describe('ToolExecutionTimeoutError', () => {
  it('extends CopilotToolError with code TIMEOUT', () => {
    const e = new ToolExecutionTimeoutError('planner_getTask', 30_000);
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('TIMEOUT');
    expect(e.retryable).toBe(true);
    expect(e.toolId).toBe('planner_getTask');
    expect(e.timeoutMs).toBe(30_000);
    expect(e.message).toBe(e.userMessage);
    expect(e.name).toBe('ToolExecutionTimeoutError');
  });
});

describe('ToolBreakerOpenError', () => {
  it('extends CopilotToolError with code CIRCUIT_OPEN', () => {
    const openUntil = Date.now() + 60_000;
    const e = new ToolBreakerOpenError('planner_getTask', openUntil);
    expect(e).toBeInstanceOf(CopilotToolError);
    expect(e.code).toBe('CIRCUIT_OPEN');
    expect(e.retryable).toBe(true);
    expect(e.toolId).toBe('planner_getTask');
    expect(e.openUntil).toBe(openUntil);
    expect(e.message).toBe(e.userMessage);
    expect(e.name).toBe('ToolBreakerOpenError');
  });
});
