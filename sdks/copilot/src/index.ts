import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { z } from 'zod';

export const RequestContextSchema = z.object({
  actor: z.object({
    type: z.literal('user'),
    user_id: z.string().min(1),
  }),
});

export type CopilotRequestContext = z.infer<typeof RequestContextSchema>;

// Element type of Mastra's ToolsInput record — the bound it uses for any heterogeneous
// agent tool collection. Keeps modules' agent-tool authoring compatible with Agent's
// `tools` field without leaking internal Tool<…> generic params.
export type CopilotTool = ToolsInput[string];

const PERMISSIONS = new WeakMap<CopilotTool, string>();

export function registerToolPermission<T extends CopilotTool>(tool: T, permission: string): T {
  PERMISSIONS.set(tool, permission);
  return tool;
}

export function requiredPermissionFor(tool: CopilotTool): string | undefined {
  return PERMISSIONS.get(tool);
}

export type CopilotToolContext = ToolExecutionContext<unknown, unknown, CopilotRequestContext>;

export interface AuthenticatedUserActor {
  type: 'user';
  user_id: string;
}

export function actorFromContext(ctx: {
  requestContext?: RequestContext<CopilotRequestContext>;
}): AuthenticatedUserActor {
  const raw = ctx?.requestContext?.get('actor');
  if (!raw || typeof raw !== 'object') {
    throw new Error('unauthenticated');
  }
  const a = raw as Partial<AuthenticatedUserActor>;
  if (a.type !== 'user' || !a.user_id) {
    throw new Error('unauthenticated');
  }
  return { type: 'user', user_id: a.user_id };
}
