import type { Actor } from './create-user.ts';
import { getUserGrants } from './get-user-grants.ts';

// Local role->permission catalog. The shipping shared-rbac `hasPermission` is
// a wildcard short-circuit on org.admin/tenant.admin and the permission registry
// is not yet implemented; this catalog gives the identity public surface a
// stable, sorted view of what each role grants. Roles absent from this map
// contribute zero permissions.
const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  'org.admin': [
    'agent.chat.use',
    'agent.config.read',
    'agent.config.write',
    'agent.rate_limit.read',
    'agent.specialist.use',
    'agent.thread.erase.any',
    'agent.thread.read.self',
    'agent.thread.write.self',
    'agent.workflow.run.cancel.self',
    'agent.workflow.run.cancel.tenant',
    'agent.workflow.run.execute.self',
    'agent.workflow.run.read.self',
    'agent.workflow.run.read.tenant',
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
    'planner.bucket.read',
    'planner.group.read',
    'planner.label.read',
    'planner.plan.read',
    'planner.task.read',
    'staffing.read',
  ],
  'org.viewer': [
    'agent.chat.use',
    'agent.rate_limit.read',
    'agent.thread.read.self',
    'agent.thread.write.self',
    'agent.workflow.run.read.self',
    'agent.workflow.run.read.tenant',
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
  'agent.admin': [
    'agent.chat.use',
    'agent.config.read',
    'agent.config.write',
    'agent.rate_limit.read',
    'agent.specialist.use',
    'agent.thread.erase.any',
    'agent.thread.read.self',
    'agent.thread.write.self',
    'agent.workflow.run.cancel.self',
    'agent.workflow.run.cancel.tenant',
    'agent.workflow.run.execute.self',
    'agent.workflow.run.read.self',
    'agent.workflow.run.read.tenant',
    'staffing.read',
  ],
  'agent.contributor': [
    'agent.chat.use',
    'agent.specialist.use',
    'agent.thread.read.self',
    'agent.thread.write.self',
    'agent.workflow.run.cancel.self',
    'agent.workflow.run.execute.self',
    'agent.workflow.run.read.self',
    'staffing.read',
  ],
  'agent.viewer': [
    'agent.chat.use',
    'agent.config.read',
    'agent.rate_limit.read',
    'agent.thread.read.self',
    'agent.thread.write.self',
    'agent.workflow.run.read.self',
    'agent.workflow.run.read.tenant',
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
  'agent.chat.use',
  'agent.thread.read.self',
  'agent.thread.write.self',
  'agent.workflow.approve',
  'agent.workflow.run.cancel.self',
  'agent.workflow.run.read.self',
  'identity.user.read.self',
  'identity.user.write.self',
  'knowledge.chat_attachment.write',
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
