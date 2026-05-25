// Public surface of @seta/copilot-sdk. Pure types + a tool-authoring helper;
// no runtime imports of @seta/copilot, no Hono.

export type { AgentToolFactory, AgentToolFactoryDeps } from './agent-tool-factory.ts';

export { defineCopilotTool } from './define-copilot-tool.ts';
export * from './hitl/index.ts';
export { registerToolPermission, requiredPermissionFor } from './rbac.ts';
export {
  CopilotRegistry,
  type CrossModuleReadCtx,
  type CrossModuleReadToolSpec,
  type CrossModuleSession,
  type Domain,
  RegistryFrozenError,
  RegistryNotFrozenError,
  type SpecialistSpec,
  type WorkflowSpec,
} from './registry.ts';
export type {
  AuthenticatedUserActor,
  CopilotRequestContext,
} from './request-context.ts';
export { actorFromContext, RequestContextSchema } from './request-context.ts';
export type { SessionLike } from './session.ts';
export type { SubscriberBuilder, SubscriberBuilderDeps } from './subscriber-builder.ts';
export type {
  CopilotTool,
  CopilotToolContext,
  CopilotToolSpec,
} from './tool.ts';
export type { WorkflowBuilder } from './workflow-builder.ts';
export type { WorkflowContribution } from './workflow-contribution.ts';
