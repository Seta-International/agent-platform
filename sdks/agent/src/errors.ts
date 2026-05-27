export type AgentToolErrorCode =
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'TIMEOUT'
  | 'CIRCUIT_OPEN'
  | 'RATE_LIMITED'
  | 'TOOL_ERROR';

export class AgentToolError extends Error {
  readonly code: AgentToolErrorCode;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly internalDetail: string;
  readonly toolId: string;

  constructor(params: {
    code: AgentToolErrorCode;
    retryable: boolean;
    userMessage: string;
    internalDetail: string;
    toolId: string;
  }) {
    super(params.userMessage); // .message === userMessage — what Mastra passes to the LLM
    this.code = params.code;
    this.retryable = params.retryable;
    this.userMessage = params.userMessage;
    this.internalDetail = params.internalDetail;
    this.toolId = params.toolId;
    this.name = 'AgentToolError';
  }
}

export class ToolExecutionTimeoutError extends AgentToolError {
  readonly timeoutMs: number;

  constructor(toolId: string, timeoutMs: number) {
    super({
      code: 'TIMEOUT',
      retryable: true,
      userMessage: `Tool '${toolId}' timed out. Try again later.`,
      internalDetail: `Tool '${toolId}' exceeded ${timeoutMs}ms execution timeout`,
      toolId,
    });
    this.timeoutMs = timeoutMs;
    this.name = 'ToolExecutionTimeoutError';
  }
}

export class ToolBreakerOpenError extends AgentToolError {
  readonly openUntil: number;

  constructor(toolId: string, openUntil: number) {
    super({
      code: 'CIRCUIT_OPEN',
      retryable: true,
      userMessage: `Tool '${toolId}' is temporarily unavailable. Try again later.`,
      internalDetail: `Circuit breaker open until ${new Date(openUntil).toISOString()}`,
      toolId,
    });
    this.openUntil = openUntil;
    this.name = 'ToolBreakerOpenError';
  }
}
