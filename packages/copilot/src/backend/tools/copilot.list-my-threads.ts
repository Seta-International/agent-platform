import { z } from 'zod';
import type { CopilotTool } from './_types.ts';

const Input = z.object({
  limit: z.number().int().positive().max(50).optional().default(20),
});

export type ListThreadsRow = {
  id: string;
  resource_id: string;
  title: string | null;
  updated_at: Date;
};

export function makeListMyThreadsTool(deps: {
  listThreads: (q: { resourceId: string; limit: number }) => Promise<ListThreadsRow[]>;
}): CopilotTool<typeof Input> {
  return {
    name: 'copilot.listMyThreads',
    description: "Lists the current user's own chat threads (most recent first).",
    inputSchema: Input,
    requiredPermission: 'copilot.thread.read.self',
    execute: async (actor, input) => {
      if (actor.type !== 'user' || !actor.user_id) throw new Error('unauthenticated');
      const threads = await deps.listThreads({ resourceId: actor.user_id, limit: input.limit });
      return { threads };
    },
  };
}
