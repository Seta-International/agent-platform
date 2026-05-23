export const NOTIFICATIONS_WRITE_PERMISSION = 'notifications.tenant_prefs.write' as const;

export const NOTIFICATIONS_PERMISSIONS = {
  [NOTIFICATIONS_WRITE_PERMISSION]: 'Manage tenant-wide notification preferences',
} as const;

export type NotificationsPermission = keyof typeof NOTIFICATIONS_PERMISSIONS;
