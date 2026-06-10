import type { SessionScope } from '@seta/core';
import { hasPermission } from '@seta/shared-rbac';
import {
  BILLING_ROLE_PERMISSIONS,
  BILLING_ROLE_SLUGS,
  type BillingPermission,
  type BillingRoleSlug,
} from '../rbac.ts';

export type BillingErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION';

export class BillingError extends Error {
  readonly code: BillingErrorCode;
  constructor(code: BillingErrorCode, message: string) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
  }
}

export function requirePermission(session: SessionScope, permission: BillingPermission): void {
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

  const held = session.role_summary.roles.filter((r): r is BillingRoleSlug =>
    (BILLING_ROLE_SLUGS as readonly string[]).includes(r),
  );
  const granted = held.some((slug) => BILLING_ROLE_PERMISSIONS[slug].includes(permission));
  if (!granted) {
    throw new BillingError('FORBIDDEN', `Missing permission: ${permission}`);
  }
}
