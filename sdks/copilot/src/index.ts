// Public surface of @seta/copilot-sdk. Pure types + a tool-authoring helper;
// no runtime imports of @seta/copilot, no Postgres, no Hono.

export { defineCopilotTool } from './define-copilot-tool.ts';

export { registerToolPermission, requiredPermissionFor } from './rbac.ts';
export type {
  AuthenticatedUserActor,
  CopilotRequestContext,
} from './request-context.ts';
export { actorFromContext, RequestContextSchema } from './request-context.ts';

export type { SessionLike } from './session.ts';

export type {
  CopilotTool,
  CopilotToolContext,
  CopilotToolSpec,
} from './tool.ts';

export type { WorkflowBuilder } from './workflow-builder.ts';
