// Public surface of @seta/agent-sdk. Pure types + a tool-authoring helper;
// no runtime imports of @seta/agent, no Hono.

export {
  __resetPendingAssignReaderForTests,
  getPendingAssignRunIdForTask,
  type PendingAssignReader,
  type PendingAssignReaderOpts,
  registerPendingAssignReader,
} from './agent-reads.ts';
export type { AgentToolFactory, AgentToolFactoryDeps } from './agent-tool-factory.ts';
export {
  __resetBreakerEmitterForTests,
  type BreakerEventEmitter,
  type BreakerOpenedEvent,
  setBreakerEventEmitter,
} from './breaker-events.ts';
export {
  __resetBreakersForTests,
  type BreakerConfig,
  setBreakerConfig,
} from './circuit-breaker.ts';
export { defineCrossModuleReadAsTool } from './cross-module-read-as-tool.ts';
export { defineAgentTool } from './define-agent-tool.ts';
export {
  __resetMutexesForTests,
  type EntityPatch,
  recordEntityExposure,
} from './entity-recorder.ts';
export {
  AgentToolError,
  type AgentToolErrorCode,
  ToolBreakerOpenError,
  ToolExecutionTimeoutError,
} from './errors.ts';
export {
  __resetExecutionPolicyForTests,
  type ExecutionPolicy,
  setExecutionPolicy,
} from './execution-policy.ts';
export * from './hitl/index.ts';
export { registerToolPermission, requiredPermissionFor } from './rbac.ts';
export {
  AgentRegistry,
  type CrossModuleReadCtx,
  type CrossModuleReadToolSpec,
  type CrossModuleSession,
  type Domain,
  RegistryFrozenError,
  RegistryNotFrozenError,
  type SpecialistSpec,
  type WorkflowDedupeKey,
  type WorkflowSpec,
} from './registry.ts';
export { assertNoSessionField } from './registry-assertions.ts';
export type {
  AgentRequestContext,
  AuthenticatedUserActor,
} from './request-context.ts';
export {
  type AgentMemoryHandle,
  actorFromContext,
  RC_AGENT_MEMORY,
  RC_THREAD_ID,
  RequestContextSchema,
} from './request-context.ts';
export type { SessionLike } from './session.ts';
export { type AgentSession, sessionFromRequestContext } from './session-context.ts';
export {
  DuplicateSpecializedAgentError,
  SpecializedAgentFrozenError,
  SpecializedAgentNotFrozenError,
  SpecializedAgentRegistry,
  type SpecializedAgentRunCtx,
  type SpecializedAgentSpec,
  type SubStepEvent,
} from './specialized-agent.ts';
export type { SubscriberBuilder, SubscriberBuilderDeps } from './subscriber-builder.ts';
export {
  resolveTaskRef,
  type TaskRefResolution,
  TaskRefResolveError,
} from './task-ref-resolver.ts';
export type {
  AgentTool,
  AgentToolContext,
  AgentToolSpec,
} from './tool.ts';
export {
  type AgentResult,
  type Citation,
  CitationSchema,
  EMPTY_TRUST,
  type TraceEntry,
  TraceEntrySchema,
  type TrustEnvelope,
  TrustEnvelopeSchema,
} from './trust.ts';
export type { WorkflowBuilder } from './workflow-builder.ts';
export type { WorkflowContribution } from './workflow-contribution.ts';
export { wrapUpdateWorkingMemoryTool } from './working-memory-guard.ts';
export {
  type ConversationEntities,
  ConversationEntitiesSchema,
  EMPTY_ENTITIES,
  EMPTY_WORKING_MEMORY,
  parseEntities,
  parseWorkingMemory,
  type RecentTask,
  RecentTaskSchema,
  serializeEntities,
  serializeWorkingMemory,
  type WorkingMemory,
  WorkingMemorySchema,
  WorkingMemoryUserContextSchema,
} from './working-memory-schema.ts';
