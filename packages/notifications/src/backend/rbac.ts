import type { SessionScope } from '@seta/core';
import { hasPermission } from '@seta/shared-rbac';
import {
  NOTIFICATIONS_ROLE_PERMISSIONS,
  NOTIFICATIONS_ROLE_SLUGS,
  type NotificationsPermission,
  type NotificationsRoleSlug,
} from '../rbac.ts';

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
  if (
    hasPermission(
      {
        roles: session.role_summary.roles,
        cross_tenant_read: session.role_summary.cross_tenant_read,
      },
      permission,
    )
  ) {
    return;
  }
  if (session.role_summary.cross_tenant_read && permission.endsWith('.read')) return;

  const held = session.role_summary.roles.filter((r): r is NotificationsRoleSlug =>
    (NOTIFICATIONS_ROLE_SLUGS as readonly string[]).includes(r),
  );
  const granted = held.some((slug) => NOTIFICATIONS_ROLE_PERMISSIONS[slug].includes(permission));
  if (!granted) {
    throw new NotificationsError('FORBIDDEN', `Missing permission: ${permission}`);
  }
}
