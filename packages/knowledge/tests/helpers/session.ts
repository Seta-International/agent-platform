import { hashRoleSummary, type SessionScope } from '@seta/core';

export function buildTestSession(opts: {
  tenant_id?: string;
  user_id?: string;
  email?: string;
  display_name?: string;
  roles?: string[];
}): SessionScope {
  const role_summary = { roles: opts.roles ?? ['org.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id ?? crypto.randomUUID(),
    tenant_id: opts.tenant_id ?? crypto.randomUUID(),
    email: opts.email ?? 'test@example.test',
    display_name: opts.display_name ?? 'Test User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}
