import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { NotificationsPermission } from '../rbac.ts';

export type NotificationsErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION';

export class NotificationsError extends Error {
  readonly code: NotificationsErrorCode;
  constructor(code: NotificationsErrorCode, message: string) {
    super(message);
    this.name = 'NotificationsError';
    this.code = code;
  }
}

export function requirePermission(
  session: SessionScope,
  permission: NotificationsPermission,
): void {
  if (!can(session, permission))
    throw new NotificationsError('FORBIDDEN', `Missing permission: ${permission}`);
}
