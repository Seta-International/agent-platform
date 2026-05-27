export class ToolExecutionTimeoutError extends Error {
  readonly code = 'tool_execution_timeout' as const;
  readonly toolId: string;
  readonly timeoutMs: number;
  constructor(toolId: string, timeoutMs: number) {
    super(`Tool '${toolId}' exceeded ${timeoutMs}ms execution timeout`);
    this.name = 'ToolExecutionTimeoutError';
    this.toolId = toolId;
    this.timeoutMs = timeoutMs;
  }
  toJSON(): {
    ok: false;
    code: 'tool_execution_timeout';
    message: string;
    toolId: string;
    timeoutMs: number;
  } {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      toolId: this.toolId,
      timeoutMs: this.timeoutMs,
    };
  }
}

export class ToolBreakerOpenError extends Error {
  readonly code = 'tool_breaker_open' as const;
  readonly toolId: string;
  readonly openUntil: number;
  constructor(toolId: string, openUntil: number) {
    super(`Tool '${toolId}' circuit breaker is open until ${new Date(openUntil).toISOString()}`);
    this.name = 'ToolBreakerOpenError';
    this.toolId = toolId;
    this.openUntil = openUntil;
  }
  toJSON(): {
    ok: false;
    code: 'tool_breaker_open';
    message: string;
    toolId: string;
    openUntil: string;
  } {
    return {
      ok: false,
      code: this.code,
      message: this.message,
      toolId: this.toolId,
      openUntil: new Date(this.openUntil).toISOString(),
    };
  }
}
