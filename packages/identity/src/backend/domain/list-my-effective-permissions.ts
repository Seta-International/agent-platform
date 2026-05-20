import type { Actor } from './create-user.ts';
import { getUserGrants } from './get-user-grants.ts';

// Local role->permission catalog mirroring docs/rbac-and-screens.md §3.1/§3.2.
// The shipping shared-rbac `hasPermission` is a wildcard short-circuit on
// org.admin/tenant.admin and the permission registry is not yet implemented.
// This catalog gives the identity public surface a stable, sorted view of what
// each role grants until the registry lands. Roles absent from this map
// contribute zero permissions.
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  'org.admin': [
    'copilot.chat.use',
    'copilot.config.read',
    'copilot.config.write',
    'copilot.rate_limit.read',
    'copilot.specialist.use',
    'copilot.thread.erase.any',
    'copilot.thread.read.self',
    'copilot.thread.write.self',
    'copilot.workflow.run.read.self',
    'copilot.workflow.run.read.tenant',
    'core.audit.read',
    'core.tenant.read',
    'core.tenant.write',
    'identity.concept_map.read',
    'identity.concept_map.write',
    'identity.password.disable_local',
    'identity.role_grant.read',
    'identity.role_grant.write',
    'identity.user.deactivate',
    'identity.user.email.change',
    'identity.user.invite',
    'identity.user.read.any',
    'identity.user.read.self',
    'identity.user.write.any',
    'identity.user.write.self',
    'identity.sso.read',
    'identity.sso.write',
    'integrations.mcp.health.read',
    'integrations.mcp.read',
    'integrations.mcp.write',
    'staffing.read',
  ],
  'org.viewer': [
    'copilot.chat.use',
    'copilot.rate_limit.read',
    'copilot.thread.read.self',
    'copilot.thread.write.self',
    'copilot.workflow.run.read.self',
    'copilot.workflow.run.read.tenant',
    'core.tenant.read',
    'identity.user.read.self',
    'identity.user.write.self',
    'integrations.mcp.health.read',
    'integrations.mcp.read',
    'staffing.read',
  ],
  'identity.admin': [
    'identity.concept_map.read',
    'identity.concept_map.write',
    'identity.password.disable_local',
    'identity.role_grant.read',
    'identity.role_grant.write',
    'identity.user.deactivate',
    'identity.user.invite',
    'identity.user.read.any',
    'identity.user.write.any',
  ],
  'identity.viewer': [
    'identity.concept_map.read',
    'identity.role_grant.read',
    'identity.user.read.any',
  ],
  'copilot.admin': [
    'copilot.chat.use',
    'copilot.config.read',
    'copilot.config.write',
    'copilot.rate_limit.read',
    'copilot.specialist.use',
    'copilot.thread.erase.any',
    'copilot.thread.read.self',
    'copilot.thread.write.self',
    'copilot.workflow.run.read.self',
    'copilot.workflow.run.read.tenant',
    'staffing.read',
  ],
  'copilot.contributor': [
    'copilot.chat.use',
    'copilot.specialist.use',
    'copilot.thread.read.self',
    'copilot.thread.write.self',
    'copilot.workflow.run.read.self',
    'staffing.read',
  ],
  'copilot.viewer': [
    'copilot.chat.use',
    'copilot.config.read',
    'copilot.rate_limit.read',
    'copilot.thread.read.self',
    'copilot.thread.write.self',
    'copilot.workflow.run.read.self',
    'copilot.workflow.run.read.tenant',
    'staffing.read',
  ],
  'integrations.admin': [
    'integrations.mcp.health.read',
    'integrations.mcp.read',
    'integrations.mcp.write',
  ],
  'integrations.viewer': ['integrations.mcp.health.read', 'integrations.mcp.read'],
  'planner.admin': [
    'planner.bucket.create',
    'planner.bucket.delete',
    'planner.bucket.read',
    'planner.bucket.update',
    'planner.checklist.write',
    'planner.group.create',
    'planner.group.delete',
    'planner.group.member.read',
    'planner.group.member.write',
    'planner.group.read',
    'planner.group.update',
    'planner.label.read',
    'planner.label.write',
    'planner.plan.create',
    'planner.plan.delete',
    'planner.plan.read',
    'planner.plan.update',
    'planner.task.assign',
    'planner.task.create',
    'planner.task.delete',
    'planner.task.read',
    'planner.task.update',
    'planner.trash.empty',
    'planner.trash.read',
    'planner.trash.restore',
  ],
};

// Implicit baseline permissions granted to every authenticated tenant member
// per docs §3.1. Listed separately so they apply regardless of which roles
// the user holds.
const IMPLICIT_USER_PERMISSIONS: readonly string[] = [
  'copilot.chat.use',
  'copilot.thread.read.self',
  'copilot.thread.write.self',
  'copilot.workflow.run.read.self',
  'identity.user.read.self',
  'identity.user.write.self',
];

export async function listMyEffectivePermissions(actor: Actor): Promise<string[]> {
  if (actor.type !== 'user' || !actor.user_id) return [];
  const grants = await getUserGrants(actor.user_id);
  const set = new Set<string>(IMPLICIT_USER_PERMISSIONS);
  for (const grant of grants) {
    const perms = ROLE_PERMISSIONS[grant.role_slug];
    if (!perms) continue;
    for (const p of perms) set.add(p);
  }
  return [...set].sort();
}
