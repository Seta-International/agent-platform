import { canonicalKeys, type ModuleRbacManifest } from './manifest.ts';

export interface StatementSpec {
  module: string;
  statement: Record<string, readonly string[]>;
  roles: { slug: string; description: string; permissions: string[] }[];
  descriptions?: Record<string, string>;
}

export const INVENTORY: StatementSpec[] = [
  {
    module: 'core',
    statement: {
      'core.skill': ['read', 'manage'],
    },
    roles: [
      {
        slug: 'core.admin',
        description: 'Manage the system-wide skill catalog',
        permissions: ['core.skill.read', 'core.skill.manage'],
      },
    ],
    descriptions: {
      'core.skill.read': 'Read the skill catalog',
      'core.skill.manage': 'Create, edit, and archive catalog skills and categories',
    },
  },
  {
    module: 'knowledge',
    statement: {
      'knowledge.file': ['read', 'update', 'delete'],
      'knowledge.search': ['read'],
      'knowledge.chat_attachment': ['create'],
    },
    roles: [
      {
        slug: 'knowledge.member',
        description: 'Read, write, and delete knowledge files',
        permissions: [
          'knowledge.file.read',
          'knowledge.file.update',
          'knowledge.file.delete',
          'knowledge.search.read',
        ],
      },
      {
        slug: 'knowledge.viewer',
        description: 'Read knowledge files',
        permissions: ['knowledge.file.read', 'knowledge.search.read'],
      },
    ],
  },
  {
    module: 'notifications',
    statement: {
      'notifications.preference': ['read', 'update'],
      'notifications.category': ['read'],
    },
    roles: [
      {
        slug: 'notifications.member',
        description: 'Read and write notification preferences',
        permissions: [
          'notifications.preference.read',
          'notifications.preference.update',
          'notifications.category.read',
        ],
      },
      {
        slug: 'notifications.viewer',
        description: 'Read notification preferences',
        permissions: ['notifications.preference.read', 'notifications.category.read'],
      },
    ],
  },
  {
    module: 'integrations',
    statement: {
      'integrations.mail': ['read', 'configure'],
      'integrations.m365': ['read', 'configure'],
      'integrations.mcp': ['read', 'update'],
      'integrations.mcp.health': ['read'],
    },
    roles: [
      {
        slug: 'integrations.admin',
        description: 'Configure mail, M365, and MCP integrations',
        permissions: [
          'integrations.mail.read',
          'integrations.mail.configure',
          'integrations.m365.read',
          'integrations.m365.configure',
          'integrations.mcp.read',
          'integrations.mcp.update',
          'integrations.mcp.health.read',
        ],
      },
      {
        slug: 'integrations.viewer',
        description: 'Read integration configuration',
        permissions: [
          'integrations.mail.read',
          'integrations.m365.read',
          'integrations.mcp.read',
          'integrations.mcp.health.read',
        ],
      },
    ],
  },
  {
    module: 'agent',
    statement: {
      'agent.chat': ['use'],
      'agent.thread': ['read', 'write'],
      'agent.workflow.run': ['read', 'execute', 'cancel'],
      'agent.workflow': ['approve'],
      'agent.config': ['read', 'update'],
      'agent.rate_limit': ['read'],
      'agent.specialist': ['use'],
      'agent.meta': ['read'],
    },
    roles: [
      {
        slug: 'agent.admin',
        description: 'Full agent administration',
        permissions: [
          'agent.chat.use',
          'agent.config.read',
          'agent.config.update',
          'agent.meta.read',
          'agent.rate_limit.read',
          'agent.specialist.use',
          'agent.thread.read',
          'agent.thread.write',
          'agent.workflow.approve',
          'agent.workflow.run.cancel',
          'agent.workflow.run.execute',
          'agent.workflow.run.read',
        ],
      },
      {
        slug: 'agent.member',
        description: 'Use agents and run workflows (member tier)',
        permissions: [
          'agent.chat.use',
          'agent.specialist.use',
          'agent.thread.read',
          'agent.thread.write',
          'agent.workflow.run.cancel',
          'agent.workflow.run.execute',
          'agent.workflow.run.read',
        ],
      },
      {
        slug: 'agent.viewer',
        description: 'Use agents and read workflow runs',
        permissions: [
          'agent.chat.use',
          'agent.config.read',
          'agent.rate_limit.read',
          'agent.thread.read',
          'agent.thread.write',
          'agent.workflow.run.read',
        ],
      },
    ],
  },
  {
    module: 'planner',
    statement: {
      'planner.group': [
        'read',
        'create',
        'update',
        'delete',
        'link_m365',
        'unlink',
        'refresh',
        'resolve_conflict',
        'mark_sync_status',
      ],
      'planner.group.member': ['read', 'write', 'set_role'],
      'planner.plan': [
        'read',
        'create',
        'update',
        'delete',
        'link_m365',
        'unlink',
        'refresh',
        'resolve_conflict',
        'mark_sync_status',
      ],
      'planner.bucket': ['read', 'create', 'update', 'delete'],
      'planner.task': ['read', 'create', 'update', 'assign', 'delete', 'mark_sync_status'],
      'planner.task.comment': ['read', 'create', 'delete'],
      'planner.reporting': ['read'],
      'planner.label': ['read', 'update'],
      'planner.checklist': ['update'],
      'planner.trash': ['read', 'restore', 'empty'],
      'planner.assignment': ['read', 'run', 'cancel'],
    },
    roles: [
      {
        slug: 'planner.admin',
        description: 'Full planner administration',
        permissions: [
          'planner.group.read',
          'planner.group.create',
          'planner.group.update',
          'planner.group.delete',
          'planner.group.member.read',
          'planner.group.member.write',
          'planner.group.member.set_role',
          'planner.group.link_m365',
          'planner.group.unlink',
          'planner.group.refresh',
          'planner.group.resolve_conflict',
          'planner.group.mark_sync_status',
          'planner.plan.read',
          'planner.plan.create',
          'planner.plan.update',
          'planner.plan.delete',
          'planner.plan.link_m365',
          'planner.plan.unlink',
          'planner.plan.refresh',
          'planner.plan.resolve_conflict',
          'planner.plan.mark_sync_status',
          'planner.bucket.read',
          'planner.bucket.create',
          'planner.bucket.update',
          'planner.bucket.delete',
          'planner.task.read',
          'planner.task.create',
          'planner.task.update',
          'planner.task.assign',
          'planner.task.delete',
          'planner.task.comment.read',
          'planner.task.comment.create',
          'planner.task.comment.delete',
          'planner.task.mark_sync_status',
          'planner.reporting.read',
          'planner.label.read',
          'planner.label.update',
          'planner.checklist.update',
          'planner.trash.read',
          'planner.trash.restore',
          'planner.trash.empty',
          'planner.assignment.read',
          'planner.assignment.run',
          'planner.assignment.cancel',
        ],
      },
      {
        slug: 'planner.member',
        description: 'Create and manage plans, buckets, and tasks (member tier)',
        permissions: [
          'planner.group.read',
          'planner.group.member.read',
          'planner.plan.read',
          'planner.plan.create',
          'planner.plan.update',
          'planner.bucket.read',
          'planner.bucket.create',
          'planner.bucket.update',
          'planner.bucket.delete',
          'planner.task.read',
          'planner.task.create',
          'planner.task.update',
          'planner.task.assign',
          'planner.task.delete',
          'planner.task.comment.read',
          'planner.task.comment.create',
          'planner.reporting.read',
          'planner.group.refresh',
          'planner.plan.refresh',
          'planner.assignment.read',
          'planner.assignment.run',
          'planner.assignment.cancel',
        ],
      },
      {
        slug: 'planner.viewer',
        description: 'Read plans, buckets, and tasks',
        permissions: [
          'planner.group.read',
          'planner.group.member.read',
          'planner.plan.read',
          'planner.bucket.read',
          'planner.task.read',
          'planner.task.comment.read',
          'planner.task.comment.create',
          'planner.reporting.read',
          'planner.group.refresh',
          'planner.plan.refresh',
          'planner.assignment.read',
        ],
      },
      {
        slug: 'system.integrations.m365',
        description: 'M365 sync system actor',
        permissions: [
          'planner.group.read',
          'planner.group.member.read',
          'planner.group.update',
          'planner.group.member.write',
          'planner.group.member.set_role',
          'planner.group.mark_sync_status',
          'planner.plan.read',
          'planner.plan.create',
          'planner.plan.update',
          'planner.plan.link_m365',
          'planner.plan.mark_sync_status',
          'planner.task.read',
          'planner.task.update',
          'planner.task.mark_sync_status',
          'people.worker.read',
          'people.worker.create',
          'people.worker.update',
          'people.org_unit.manage',
        ],
      },
    ],
  },
  {
    module: 'people',
    statement: {
      'people.worker': ['read', 'create', 'update', 'manage'],
      'people.self': ['read', 'manage'],
      'people.performance': ['read'],
      'people.org_unit': ['manage'],
    },
    descriptions: {
      'people.performance.read': 'Enter the Performance surface and read own capacities',
      'people.org_unit.manage': 'Rename, re-parent, and delete org units',
    },
    roles: [
      {
        slug: 'people.manager',
        description: 'People management across the granted scope',
        permissions: [
          'people.worker.read',
          'people.worker.create',
          'people.worker.update',
          'people.worker.manage',
          'people.self.read',
          'people.self.manage',
          'people.performance.read',
          'people.org_unit.manage',
          'core.skill.read',
        ],
      },
      {
        slug: 'people.viewer',
        description: 'Read people records',
        permissions: [
          'people.worker.read',
          'people.self.read',
          'people.self.manage',
          'people.performance.read',
          'core.skill.read',
        ],
      },
    ],
  },
  {
    module: 'hiring',
    statement: {
      'hiring.requisition': ['read', 'read.all', 'open', 'manage', 'close'],
      'hiring.jd_template': ['read', 'manage'],
      'hiring.candidate': ['read', 'create', 'manage', 'reject', 'transfer'],
      'hiring.rejection_reason': ['read', 'manage'],
    },
    roles: [
      {
        slug: 'hiring.manager',
        description: 'Hiring management across the granted scope',
        permissions: [
          'hiring.requisition.read',
          'hiring.requisition.read.all',
          'hiring.requisition.open',
          'hiring.requisition.manage',
          'hiring.requisition.close',
          'hiring.jd_template.read',
          'hiring.jd_template.manage',
          'hiring.candidate.read',
          'hiring.candidate.create',
          'hiring.candidate.manage',
          'hiring.candidate.reject',
          'hiring.candidate.transfer',
          'hiring.rejection_reason.read',
          'hiring.rejection_reason.manage',
          'core.skill.read',
        ],
      },
      {
        slug: 'hiring.recruiter',
        description: 'Run requisitions, candidates, interviews, offers',
        permissions: [
          'hiring.requisition.read',
          'hiring.requisition.read.all',
          'hiring.requisition.open',
          'hiring.requisition.manage',
          'hiring.requisition.close',
          'hiring.jd_template.read',
          'hiring.jd_template.manage',
          'hiring.candidate.read',
          'hiring.candidate.create',
          'hiring.candidate.manage',
          'hiring.candidate.reject',
          'hiring.candidate.transfer',
          'hiring.rejection_reason.read',
          'hiring.rejection_reason.manage',
          'core.skill.read',
        ],
      },
      {
        slug: 'hiring.viewer',
        description: 'Read hiring records (account-scoped for AM/EM/TL/PM personas)',
        permissions: [
          'hiring.requisition.read',
          'hiring.jd_template.read',
          'hiring.candidate.read',
          'hiring.rejection_reason.read',
        ],
      },
      {
        slug: 'hiring.viewer_all',
        description: 'Read every hiring record, unscoped (BOD/PMO)',
        permissions: [
          'hiring.requisition.read',
          'hiring.requisition.read.all',
          'hiring.jd_template.read',
          'hiring.candidate.read',
          'hiring.rejection_reason.read',
        ],
      },
    ],
  },
  {
    module: 'pm',
    statement: {
      'pm.account': ['read', 'manage'],
      'pm.charter': ['submit', 'pmo_signoff', 'bod_approve', 'read'],
      'pm.project': ['read', 'manage'],
    },
    roles: [
      {
        slug: 'pm.manager',
        description:
          'Project management across the granted scope: raises charters and runs delivery (no approval gate)',
        permissions: [
          'pm.account.read',
          'pm.account.manage',
          'pm.charter.submit',
          'pm.charter.read',
          'pm.project.read',
          'pm.project.manage',
          // Staffing (RA Monitoring "Add allocation") must look up people to place on a
          // project; the worker directory is tenant-wide for any holder (FUT-542).
          'people.worker.read',
        ],
      },
      {
        slug: 'pm.pmo',
        description: 'PMO review gate + post-approval staffing & access',
        permissions: [
          'pm.account.read',
          'pm.charter.pmo_signoff',
          'pm.charter.read',
          'pm.project.read',
          'pm.project.manage',
          'people.performance.read',
          // Post-approval staffing looks up people to allocate; see pm.manager note above.
          'people.worker.read',
        ],
      },
      {
        slug: 'pm.bod',
        description: 'Board final approval gate + organization-wide read (FUT-610 org-scope)',
        permissions: [
          'pm.account.read',
          'pm.charter.bod_approve',
          'pm.charter.read',
          'pm.project.read',
          'people.performance.read',
        ],
      },
      {
        slug: 'pm.viewer',
        description: 'Read project-management records',
        permissions: ['pm.account.read', 'pm.charter.read', 'pm.project.read'],
      },
    ],
  },
  {
    module: 'identity',
    statement: {
      'identity.user': ['read', 'list', 'update', 'deactivate', 'invite', 'change_email'],
      'identity.profile': ['read', 'update'],
      'identity.sso': ['read', 'update'],
      'identity.role': ['grant', 'read', 'update'],
      'identity.role_grant': ['read', 'update'],
      'identity.password': ['disable_local'],
      'identity.concept_map': ['read', 'update'],
      'identity.group': ['read', 'create', 'update', 'delete'],
      'identity.group.membership': ['manage'],
      'identity.group.role': ['manage'],
      'identity.product_access': ['read', 'grant', 'revoke'],
      'core.tenant': ['read', 'update'],
      'core.tenant.email_domains': ['update'],
      'core.audit': ['read'],
    },
    roles: [
      {
        slug: 'identity.admin',
        description: 'Manage users, roles, SSO, and identity settings',
        permissions: [
          'identity.user.list',
          'identity.user.update',
          'identity.user.deactivate',
          'identity.user.invite',
          'identity.user.change_email',
          'identity.sso.read',
          'identity.sso.update',
          // Dedicated email-domains update permission (not core.tenant.update).
          'core.tenant.email_domains.update',
          'identity.role.grant',
          'identity.role.read',
          'identity.role.update',
          'identity.role_grant.read',
          'identity.role_grant.update',
          'identity.password.disable_local',
          'identity.concept_map.read',
          'identity.concept_map.update',
          'identity.group.read',
          'identity.group.create',
          'identity.group.update',
          'identity.group.delete',
          'identity.group.membership.manage',
          'identity.group.role.manage',
          'identity.product_access.read',
          'identity.product_access.grant',
          'identity.product_access.revoke',
        ],
      },
      {
        slug: 'identity.viewer',
        description: 'Read users, role grants, and concept maps',
        permissions: [
          'identity.user.list',
          'identity.role_grant.read',
          'identity.concept_map.read',
        ],
      },
    ],
  },
];

export const IMPLICIT_PERMISSIONS: readonly string[] = [
  'agent.chat.use',
  'agent.meta.read',
  'agent.thread.read',
  'agent.thread.write',
  'agent.workflow.approve',
  'agent.workflow.run.cancel',
  'agent.workflow.run.execute',
  'agent.workflow.run.read',
  'identity.user.read',
  'identity.profile.read',
  'identity.profile.update',
  'knowledge.chat_attachment.create',
  'people.self.read',
  'people.self.manage',
];

// Foundation roles resolved specially by resolve.ts (not declared in any module statement):
// org.admin / tenant.admin = wildcard; org.viewer = all '.read' actions + cross_tenant_read.
export const FOUNDATION_ROLES = ['org.admin', 'tenant.admin', 'org.viewer'] as const;

const SYSTEM_ROLES = ['system.integrations.m365'] as const;
export const EDITABLE_ROLES: string[] = INVENTORY.flatMap((m) => m.roles.map((r) => r.slug))
  .filter((slug) => !(FOUNDATION_ROLES as readonly string[]).includes(slug))
  .filter((slug) => !(SYSTEM_ROLES as readonly string[]).includes(slug));

const MODULE_ROLE_SLUGS = INVENTORY.flatMap((m) => m.roles.map((r) => r.slug)).filter(
  (slug) => !(SYSTEM_ROLES as readonly string[]).includes(slug),
);
// Foundation roles a human admin may grant (tenant.admin is the implicit wildcard, not offered).
export const ASSIGNABLE_ROLES: string[] = ['org.admin', 'org.viewer', ...MODULE_ROLE_SLUGS];

export function inventoryToManifests(
  inv: readonly StatementSpec[] = INVENTORY,
): ModuleRbacManifest[] {
  return inv.map((s) => ({
    module: s.module,
    permissions: canonicalKeys(s.statement).map((key) => ({
      key,
      description: s.descriptions?.[key] ?? key,
    })),
    roles: s.roles.map((r) => ({
      slug: r.slug,
      description: r.description,
      permissions: [...r.permissions].sort(),
    })),
  }));
}
