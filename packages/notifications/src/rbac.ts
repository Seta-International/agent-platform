export const NOTIFICATIONS_PERMISSIONS = [
  'notifications.preference.read',
  'notifications.preference.write',
  'notifications.category.read',
] as const;
export type NotificationsPermission = (typeof NOTIFICATIONS_PERMISSIONS)[number];

export const NOTIFICATIONS_ROLE_SLUGS = ['notifications.member', 'notifications.viewer'] as const;
export type NotificationsRoleSlug = (typeof NOTIFICATIONS_ROLE_SLUGS)[number];

export const NOTIFICATIONS_ROLE_PERMISSIONS: Record<
  NotificationsRoleSlug,
  NotificationsPermission[]
> = {
  'notifications.member': [
    'notifications.preference.read',
    'notifications.preference.write',
    'notifications.category.read',
  ],
  'notifications.viewer': ['notifications.preference.read', 'notifications.category.read'],
};
