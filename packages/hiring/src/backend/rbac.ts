export type HiringErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'CROSS_TENANT';

export class HiringError extends Error {
  readonly code: HiringErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: HiringErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'HiringError';
    this.code = code;
    this.details = details;
  }
}
