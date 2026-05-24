export {
  findCategory,
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from './backend/domain/categories.ts';
export {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationMutationResult,
  NotificationNotFound,
} from './backend/domain/mutations.ts';
export {
  listNotificationPrefs,
  NotificationPrefError,
  type NotificationPrefErrorCode,
  type NotificationPrefMatrix,
  type NotificationPrefRow,
  setNotificationPref,
} from './backend/domain/prefs.ts';
export {
  getUnreadCount,
  type ListNotificationsInput,
  listNotifications,
  type Notification,
} from './backend/domain/queries.ts';
export { type RequestNotificationInput, requestNotification } from './backend/domain/request.ts';
export {
  NotificationsError,
  requirePermission as requireNotificationsPermission,
} from './backend/rbac.ts';
export { NOTIFY_CHANNEL, notifierSubscriber } from './backend/subscribers/notifier.ts';
export {
  NOTIFICATION_REQUESTED,
  NOTIFICATION_REQUESTED_VERSION,
  NOTIFICATION_TENANT_PREFS_CHANGED,
  NOTIFICATION_TENANT_PREFS_CHANGED_VERSION,
  type NotificationRequestedPayload,
  type NotificationTenantPrefsChangedPayload,
} from './events.ts';
export {
  NOTIFICATIONS_PERMISSIONS,
  NOTIFICATIONS_ROLE_PERMISSIONS,
  NOTIFICATIONS_ROLE_SLUGS,
  type NotificationsPermission,
  type NotificationsRoleSlug,
} from './rbac.ts';
