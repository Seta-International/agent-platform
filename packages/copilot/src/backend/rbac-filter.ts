import { type CopilotTool, requiredPermissionFor } from '@seta/copilot-sdk';

type SessionLike = { effective_permissions: ReadonlySet<string> };

export function filterToolsByRbac<T extends CopilotTool>(
  tools: readonly T[],
  session: SessionLike,
): T[] {
  return tools.filter((t) => {
    const required = requiredPermissionFor(t);
    return required != null && session.effective_permissions.has(required);
  });
}
