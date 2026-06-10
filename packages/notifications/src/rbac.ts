import { type Statement, toManifest } from '@seta/shared-rbac';

export const notificationsStatement = {
  'notifications.preference': ['read', 'write'],
  'notifications.category': ['read'],
} as const satisfies Statement;

const roleStatements = {
  'notifications.member': {
    'notifications.preference': ['read', 'write'],
    'notifications.category': ['read'],
  },
  'notifications.viewer': {
    'notifications.preference': ['read'],
    'notifications.category': ['read'],
  },
} as const satisfies Record<string, Statement>;

export const notificationsRbac = toManifest(
  'notifications',
  notificationsStatement,
  roleStatements,
  {
    'notifications.member': 'Read and write notification preferences',
    'notifications.viewer': 'Read notification preferences',
  },
);

export type NotificationsPermission = (typeof notificationsRbac.permissions)[number]['key'];

export const NOTIFICATIONS_PERMISSIONS = notificationsRbac.permissions.map((p) => p.key);

export const NOTIFICATIONS_ROLE_SLUGS = notificationsRbac.roles.map((r) => r.slug) as Array<
  'notifications.member' | 'notifications.viewer'
>;
export type NotificationsRoleSlug = (typeof NOTIFICATIONS_ROLE_SLUGS)[number];

export const NOTIFICATIONS_ROLE_PERMISSIONS = Object.fromEntries(
  notificationsRbac.roles.map((r) => [r.slug, r.permissions]),
) as Record<NotificationsRoleSlug, string[]>;
