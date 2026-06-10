import { canonicalKeys, type ModuleRbacManifest } from './manifest.ts';

export interface StatementSpec {
  module: string;
  statement: Record<string, readonly string[]>;
  roles: { slug: string; description: string; permissions: string[] }[];
  descriptions?: Record<string, string>;
}

export const INVENTORY: StatementSpec[] = [
  {
    module: 'knowledge',
    statement: {
      'knowledge.file': ['read', 'write', 'delete'],
      'knowledge.search': ['read'],
      'knowledge.chat_attachment': ['write'],
    },
    roles: [
      {
        slug: 'knowledge.member',
        description: 'Read, write, and delete knowledge files',
        permissions: [
          'knowledge.file.read',
          'knowledge.file.write',
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
      'notifications.preference': ['read', 'write'],
      'notifications.category': ['read'],
    },
    roles: [
      {
        slug: 'notifications.member',
        description: 'Read and write notification preferences',
        permissions: [
          'notifications.preference.read',
          'notifications.preference.write',
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
      'integrations.m365': ['read', 'config.write'],
      'integrations.mcp': ['read', 'write', 'health.read'],
    },
    roles: [
      {
        slug: 'integrations.admin',
        description: 'Configure mail, M365, and MCP integrations',
        permissions: [
          'integrations.mail.read',
          'integrations.mail.configure',
          'integrations.m365.read',
          'integrations.m365.config.write',
          'integrations.mcp.read',
          'integrations.mcp.write',
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
    module: 'staffing',
    statement: {
      staffing: ['read'],
      'staffing.workflow': ['read', 'run', 'cancel'],
    },
    roles: [
      {
        slug: 'staffing.operator',
        description: 'Run and cancel staffing workflows',
        permissions: [
          'staffing.read',
          'staffing.workflow.read',
          'staffing.workflow.run',
          'staffing.workflow.cancel',
        ],
      },
      {
        slug: 'staffing.viewer',
        description: 'Read staffing workflows',
        permissions: ['staffing.read', 'staffing.workflow.read'],
      },
    ],
  },
  {
    module: 'agent',
    statement: {
      'agent.chat': ['use'],
      'agent.thread': ['read.self', 'write.self', 'erase.any'],
      'agent.workflow.run': [
        'read.self',
        'read.tenant',
        'read.instance',
        'execute.self',
        'cancel.self',
        'cancel.tenant',
        'cancel.instance',
      ],
      'agent.workflow': ['approve'],
      'agent.config': ['read', 'write'],
      'agent.rate_limit': ['read'],
      'agent.specialist': ['use'],
      'agent.meta': ['read.self'],
    },
    roles: [
      {
        slug: 'agent.admin',
        description: 'Full agent administration',
        permissions: [
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
        ],
      },
      {
        slug: 'agent.contributor',
        description: 'Use agents and run workflows',
        permissions: [
          'agent.chat.use',
          'agent.specialist.use',
          'agent.thread.read.self',
          'agent.thread.write.self',
          'agent.workflow.run.cancel.self',
          'agent.workflow.run.execute.self',
          'agent.workflow.run.read.self',
        ],
      },
      {
        slug: 'agent.viewer',
        description: 'Use agents and read workflow runs',
        permissions: [
          'agent.chat.use',
          'agent.config.read',
          'agent.rate_limit.read',
          'agent.thread.read.self',
          'agent.thread.write.self',
          'agent.workflow.run.read.self',
          'agent.workflow.run.read.tenant',
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
        'member.read',
        'member.write',
        'member.role.set',
        'link.m365',
        'unlink',
        'refresh',
        'resolve-conflict',
        'sync.mark-status',
      ],
      'planner.plan': [
        'read',
        'create',
        'update',
        'delete',
        'link.m365',
        'unlink',
        'refresh',
        'resolve-conflict',
        'sync.mark-status',
      ],
      'planner.bucket': ['read', 'create', 'update', 'delete'],
      'planner.task': [
        'read',
        'read.tenant',
        'create',
        'update',
        'assign',
        'delete',
        'comment.read',
        'comment.create',
        'comment.delete.any',
        'sync.mark-status',
      ],
      'planner.label': ['read', 'write'],
      'planner.checklist': ['write'],
      'planner.trash': ['read', 'restore', 'empty'],
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
          'planner.group.member.role.set',
          'planner.group.link.m365',
          'planner.group.unlink',
          'planner.group.refresh',
          'planner.group.resolve-conflict',
          'planner.group.sync.mark-status',
          'planner.plan.read',
          'planner.plan.create',
          'planner.plan.update',
          'planner.plan.delete',
          'planner.plan.link.m365',
          'planner.plan.unlink',
          'planner.plan.refresh',
          'planner.plan.resolve-conflict',
          'planner.plan.sync.mark-status',
          'planner.bucket.read',
          'planner.bucket.create',
          'planner.bucket.update',
          'planner.bucket.delete',
          'planner.task.read',
          'planner.task.read.tenant',
          'planner.task.create',
          'planner.task.update',
          'planner.task.assign',
          'planner.task.delete',
          'planner.task.comment.read',
          'planner.task.comment.create',
          'planner.task.comment.delete.any',
          'planner.task.sync.mark-status',
          'planner.label.read',
          'planner.label.write',
          'planner.checklist.write',
          'planner.trash.read',
          'planner.trash.restore',
          'planner.trash.empty',
        ],
      },
      {
        slug: 'planner.contributor',
        description: 'Create and manage plans, buckets, and tasks',
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
          'planner.task.read.tenant',
          'planner.task.create',
          'planner.task.update',
          'planner.task.assign',
          'planner.task.delete',
          'planner.task.comment.read',
          'planner.task.comment.create',
          'planner.group.refresh',
          'planner.plan.refresh',
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
          'planner.task.read.tenant',
          'planner.task.comment.read',
          'planner.task.comment.create',
          'planner.group.refresh',
          'planner.plan.refresh',
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
          'planner.group.member.role.set',
          'planner.group.sync.mark-status',
          'planner.plan.read',
          'planner.plan.update',
          'planner.plan.sync.mark-status',
          'planner.task.read',
          'planner.task.update',
          'planner.task.sync.mark-status',
        ],
      },
    ],
  },
  {
    module: 'identity',
    statement: {
      'identity.user': [
        'read',
        'read.any',
        'read.self',
        'write',
        'write.self',
        'deactivate',
        'invite',
        'email.change',
      ],
      'identity.sso': ['read', 'write'],
      'identity.role': ['grant', 'read', 'write'],
      'identity.role_grant': ['read', 'write'],
      'identity.password': ['disable_local'],
      'identity.concept_map': ['read', 'write'],
      'core.tenant': ['read', 'write'],
      'core.audit': ['read'],
    },
    roles: [
      {
        slug: 'identity.admin',
        description: 'Manage users, roles, SSO, and identity settings',
        permissions: [
          'identity.user.read.any',
          'identity.user.write',
          'identity.user.deactivate',
          'identity.user.invite',
          'identity.user.email.change',
          'identity.sso.read',
          'identity.sso.write',
          'identity.role.grant',
          'identity.role.read',
          'identity.role.write',
          'identity.role_grant.read',
          'identity.role_grant.write',
          'identity.password.disable_local',
          'identity.concept_map.read',
          'identity.concept_map.write',
        ],
      },
      {
        slug: 'identity.viewer',
        description: 'Read users, role grants, and concept maps',
        permissions: [
          'identity.user.read.any',
          'identity.role_grant.read',
          'identity.concept_map.read',
        ],
      },
    ],
  },
];

export const IMPLICIT_PERMISSIONS: readonly string[] = [
  'agent.chat.use',
  'agent.meta.read.self',
  'agent.thread.read.self',
  'agent.thread.write.self',
  'agent.workflow.approve',
  'agent.workflow.run.cancel.self',
  'agent.workflow.run.read.self',
  'identity.user.read',
  'identity.user.read.self',
  'identity.user.write.self',
  'knowledge.chat_attachment.write',
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
