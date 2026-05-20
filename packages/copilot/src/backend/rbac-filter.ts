import type { ZodTypeAny } from 'zod';
import type { CopilotTool } from './tools/_types.ts';

type SessionLike = { effective_permissions: ReadonlySet<string> };

export function filterToolsByRbac<T extends CopilotTool<ZodTypeAny>>(
  tools: readonly T[],
  session: SessionLike,
): T[] {
  return tools.filter((t) => session.effective_permissions.has(t.requiredPermission));
}
