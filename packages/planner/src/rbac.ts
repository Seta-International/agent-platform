import { type Statement, toManifest } from '@seta/shared-rbac';

export const plannerStatement = {
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
} as const satisfies Statement;

const roleStatements = {
  'planner.admin': {
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
  'planner.contributor': {
    'planner.group': ['read', 'member.read', 'refresh'],
    'planner.plan': ['read', 'create', 'update', 'refresh'],
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
    ],
  },
  'planner.viewer': {
    'planner.group': ['read', 'member.read', 'refresh'],
    'planner.plan': ['read', 'refresh'],
    'planner.bucket': ['read'],
    'planner.task': ['read', 'read.tenant', 'comment.read', 'comment.create'],
  },
  'system.integrations.m365': {
    'planner.group': [
      'read',
      'update',
      'member.read',
      'member.write',
      'member.role.set',
      'sync.mark-status',
    ],
    'planner.plan': ['read', 'update', 'sync.mark-status'],
    'planner.task': ['read', 'update', 'sync.mark-status'],
  },
} as const satisfies Record<string, Statement>;

export const plannerRbac = toManifest('planner', plannerStatement, roleStatements, {
  'planner.admin': 'Full planner administration',
  'planner.contributor': 'Create and manage plans, buckets, and tasks',
  'planner.viewer': 'Read plans, buckets, and tasks',
  'system.integrations.m365': 'M365 sync system actor',
});

export type PlannerPermission = (typeof plannerRbac.permissions)[number]['key'];

export const PLANNER_PERMISSIONS = plannerRbac.permissions.map((p) => p.key);

export const PLANNER_ROLE_SLUGS = plannerRbac.roles.map((r) => r.slug) as Array<
  'planner.admin' | 'planner.contributor' | 'planner.viewer' | 'system.integrations.m365'
>;
export type PlannerRoleSlug = (typeof PLANNER_ROLE_SLUGS)[number];

export const PLANNER_ROLE_PERMISSIONS = Object.fromEntries(
  plannerRbac.roles.map((r) => [r.slug, r.permissions]),
) as Record<PlannerRoleSlug, PlannerPermission[]>;
