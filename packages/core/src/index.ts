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
  type CoreNotificationRequestedPayload,
  dismissNotification,
  getUnreadCount,
  type ListNotificationsInput,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
  type NotificationMutationResult,
  NotificationNotFound,
  type RequestNotificationInput,
  requestNotification,
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
