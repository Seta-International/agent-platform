import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { PmPermission } from '../rbac.ts';

export type PmErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION' | 'CROSS_TENANT';

export class PmError extends Error {
  readonly code: PmErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PmErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PmError';
    this.code = code;
    this.details = details;
  }
}

export function requirePermission(session: SessionScope, permission: PmPermission): void {
  if (!can(session, permission)) {
    throw new PmError('FORBIDDEN', `Missing permission: ${permission}`, { permission });
  }
}
