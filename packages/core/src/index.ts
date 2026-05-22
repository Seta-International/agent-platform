export {
  type AuditQueryOpts,
  type AuditRow,
  type AuditSortBy,
  type AuditSortDir,
  queryAudit,
} from './backend/audit.ts';
export { buildHonoApp } from './composition/hono-app.ts';
export { runMigrations } from './composition/migrations.ts';
export { type ContributionRegistry, createContributionRegistry } from './composition/registry.ts';
export type { OutgoingEmailStatus, TransportKind } from './db/schema/index.ts';
export {
  addEventTap,
  type EventTapHandler,
  type EventTapPredicate,
  startDispatcher,
} from './dispatcher/index.ts';
export {
  createSessionMiddleware,
  type SessionEnv,
  type SessionMiddlewareDeps,
} from './middleware/session.ts';
export {
  CORE_NOTIFICATION_REQUESTED,
  CORE_TENANT_NOTIFICATION_PREFS_CHANGED,
  type CoreNotificationRequestedPayload,
  type CoreTenantNotificationPrefsChangedPayload,
  dismissNotification,
  findCategory,
  getUnreadCount,
  type ListNotificationsInput,
  listNotificationPrefs,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_CATEGORIES,
  NOTIFICATIONS_WRITE_PERMISSION,
  type Notification,
  type NotificationCategory,
  type NotificationMutationResult,
  NotificationNotFound,
  NotificationPrefError,
  type NotificationPrefErrorCode,
  type NotificationPrefMatrix,
  type NotificationPrefRow,
  type RequestNotificationInput,
  requestNotification,
  setNotificationPref,
} from './notifications/index.ts';
export {
  type CreateOutboxStoreDeps,
  createOutboxStore,
  type OutboxRow,
  type OutboxStore,
  type UpsertPendingInput,
} from './outbox/store.ts';
export { invalidateUserSessions } from './session/invalidate.ts';
export {
  computeAccessibleGroups,
  getSessionScope,
  hashRoleSummary,
  type ListRoleGrants,
  type RoleGrant,
  rollup,
  type SessionScope,
} from './session/scope.ts';
