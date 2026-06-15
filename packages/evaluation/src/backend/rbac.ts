import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { EvaluationPermission } from '../rbac.ts';

export type EvaluationErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CROSS_TENANT'
  | 'CONFLICT';

export class EvaluationError extends Error {
  constructor(
    public readonly code: EvaluationErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'EvaluationError';
  }
}

export function requirePermission(
  session: SessionScope,
  permission: EvaluationPermission,
): void {
  if (!can(session, permission)) {
    throw new EvaluationError('FORBIDDEN', `Missing permission: ${permission}`, { permission });
  }
}
