import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { HiringPermission } from '../rbac.ts';

export type HiringErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION';

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

export function requirePermission(session: SessionScope, permission: HiringPermission): void {
  if (!can(session, permission)) {
    throw new HiringError('FORBIDDEN', `Missing permission: ${permission}`, { permission });
  }
}
