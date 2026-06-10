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
