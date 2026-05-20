import type { SessionScope } from '@seta/core';

export function isTenantAdminish(session: SessionScope): boolean {
  return session.role_summary.roles.some((r) => r === 'org.admin' || r === 'tenant.admin');
}

export function groupFilterFor(session: SessionScope): readonly string[] | null {
  if (isTenantAdminish(session) || session.role_summary.cross_tenant_read) return null;
  return session.accessible_group_ids;
}
