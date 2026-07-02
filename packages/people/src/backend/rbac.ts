import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { PeoplePermission } from '../rbac.ts';

export type PeopleErrorCode = 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION';

export class PeopleError extends Error {
  readonly code: PeopleErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PeopleErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PeopleError';
    this.code = code;
    this.details = details;
  }
}

export function requirePermission(session: SessionScope, permission: PeoplePermission): void {
  if (!can(session, permission)) {
    throw new PeopleError('FORBIDDEN', `Missing permission: ${permission}`, { permission });
  }
}
