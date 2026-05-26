export class ToolExecutionTimeoutError extends Error {
  readonly code = 'tool_execution_timeout' as const;
  constructor(
    public readonly toolId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Tool '${toolId}' exceeded ${timeoutMs}ms execution timeout`);
    this.name = 'ToolExecutionTimeoutError';
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
  constructor(
    public readonly toolId: string,
    public readonly openUntil: number,
  ) {
    super(`Tool '${toolId}' circuit breaker is open until ${new Date(openUntil).toISOString()}`);
    this.name = 'ToolBreakerOpenError';
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
