export {
  type AuditQueryOpts,
  type AuditRow,
  type AuditSortBy,
  type AuditSortDir,
  queryAudit,
} from './backend/audit.ts';
export { buildHonoApp } from './composition/hono-app.ts';
export {
  type AgentSpec,
  type ContributionRegistry,
  createContributionRegistry,
  type ErrorMapper,
  type RouteBuildDeps,
  type RouteContribution,
  type StreamHubBuildDeps,
  type StreamHubBuilder,
  type StreamHubHandle,
} from './composition/registry.ts';
export type { OutgoingEmailStatus, TransportKind } from './db/schema/index.ts';
export {
  createSessionMiddleware,
  type SessionEnv,
  type SessionMiddlewareDeps,
} from './middleware/session.ts';
export {
  type CreateOutboxStoreDeps,
  createOutboxStore,
  type OutboxRow,
  type OutboxStore,
  type UpsertPendingInput,
} from './outbox/store.ts';
export {
  addEventTap,
  type EventTapHandler,
  type EventTapPredicate,
} from './runtime/dispatcher/index.ts';
export { runMigrations } from './runtime/migrations.ts';
export type { WorkerHandle } from './runtime/workers/index.ts';
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
