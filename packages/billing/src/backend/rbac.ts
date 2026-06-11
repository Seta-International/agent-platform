import type { SessionScope } from '@seta/core';
import { can } from '@seta/shared-rbac';
import type { BillingPermission } from '../rbac.ts';

export type BillingErrorCode = 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION';

export class BillingError extends Error {
  readonly code: BillingErrorCode;
  constructor(code: BillingErrorCode, message: string) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
  }
}

// Permission resolution is registry-backed (session.permissions is resolved at
// scope build from the RBAC inventory: org.admin = wildcard, org.viewer = every
// `.read`). billing.read therefore resolves without any per-role hardcode here.
export function requirePermission(session: SessionScope, permission: BillingPermission): void {
  if (!can(session, permission)) {
    throw new BillingError('FORBIDDEN', `Missing permission: ${permission}`);
  }
}
