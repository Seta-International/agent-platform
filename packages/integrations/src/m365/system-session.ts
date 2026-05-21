import type { PlannerSessionScope } from '@seta/planner';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_SESSION_ID = '00000000-0000-0000-0000-00000000m365';
const SYSTEM_EMAIL = 'system+integrations.m365@seta.internal';
const SYSTEM_DISPLAY_NAME = 'M365 Sync System';
const SYSTEM_ROLE_SUMMARY_HASH = 'system-integrations-m365';

export function buildSystemSession(tenantId: string): PlannerSessionScope {
  return {
    session_id: SYSTEM_SESSION_ID,
    user_id: SYSTEM_USER_ID,
    tenant_id: tenantId,
    email: SYSTEM_EMAIL,
    display_name: SYSTEM_DISPLAY_NAME,
    role_summary: {
      roles: ['system.integrations.m365'],
      cross_tenant_read: false,
    },
    role_summary_hash: SYSTEM_ROLE_SUMMARY_HASH,
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
    actor: { kind: 'system', system_id: 'integrations.m365' },
  };
}
