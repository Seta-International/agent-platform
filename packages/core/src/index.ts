export {
  type AuditQueryOpts,
  type AuditRow,
  type AuditSortBy,
  type AuditSortDir,
  queryAudit,
} from './backend/audit.ts';
export {
  archiveSkillCategory,
  createSkillCategory,
  editSkillCategory,
  listSkillCategories,
  type SkillCategoryRow,
} from './backend/skills/categories.ts';
export { CoreSkillError } from './backend/skills/error.ts';
export {
  CORE_SKILL_ARCHIVED,
  CORE_SKILL_CATEGORY_ARCHIVED,
  CORE_SKILL_CATEGORY_CREATED,
  CORE_SKILL_CATEGORY_UPDATED,
  CORE_SKILL_CREATED,
  CORE_SKILL_EVENTS,
  CORE_SKILL_UPDATED,
} from './backend/skills/events.ts';
export {
  archiveSkill,
  createSkill,
  editSkill,
  listSkills,
  type SkillRow,
} from './backend/skills/skills.ts';
export { captureException, registerErrorCapture } from './composition/error-capture.ts';
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
export { requestIdMiddleware, requestIdStorage } from './composition/request-id.ts';
export type { OutgoingEmailStatus, TransportKind } from './db/schema/index.ts';
export { getTenantEmailDomains } from './db/tenant-email-domains.ts';
export {
  applyFeatureFlag,
  FlagError,
  GLOBAL_TENANT,
} from './flags/apply-feature-flag.ts';
export { getEffectiveFlag, resetFlagCache } from './flags/cache.ts';
export { getFlagCatalog, isKnownFlagKey, setFlagCatalog } from './flags/catalog.ts';
export { CORE_FEATURE_FLAG_EVENTS, CORE_FEATURE_FLAG_UPDATED } from './flags/events.ts';
export { isFeatureEnabled } from './flags/is-feature-enabled.ts';
export { type FeatureFlagView, listFeatureFlags } from './flags/list.ts';
export { SetaFeatureProvider } from './flags/provider.ts';
export { requireFeature } from './flags/require-feature.ts';
export { resolveFeatures } from './flags/resolve-features.ts';
export { setFeatureFlag } from './flags/set-feature-flag.ts';
export {
  evaluateStrategies,
  getStrategy,
  knownStrategyKinds,
  registerStrategy,
} from './flags/strategies.ts';
export type {
  FlagContext,
  FlagDef,
  FlagRow,
  FlagStrategy,
  FlagStrategyConfig,
} from './flags/types.ts';
export { type FeatureFlagUsage, getFeatureFlagUsage } from './flags/usage.ts';
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
export { invalidateTenantSessions, invalidateUserSessions } from './session/invalidate.ts';
export { createOverlayStore, type OverlayStore } from './session/overlay-store.ts';
export {
  computeAccessibleGroups,
  evictHotAll,
  getSessionScope,
  hashRoleSummary,
  type ListRoleGrants,
  type ResolveFeatures,
  type RoleGrant,
  rollup,
  type SessionScope,
} from './session/scope.ts';
