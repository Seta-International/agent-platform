import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { z } from 'zod';

export type ListThreadsRow = {
  id: string;
  resource_id: string;
  title: string | null;
  updated_at: Date;
};

const Input = z.object({
  limit: z.number().int().positive().max(50).optional().default(20),
});

const Output = z.object({
  threads: z.array(
    z.object({
      id: z.string(),
      resource_id: z.string(),
      title: z.string().nullable(),
      updated_at: z.date(),
    }),
  ),
});

export function makeListMyThreadsTool(deps: {
  listThreads: (q: { resourceId: string; limit: number }) => Promise<ListThreadsRow[]>;
}) {
  return defineCopilotTool({
    id: 'copilot_listMyThreads',
    name: 'List My Chat Threads',
    description: "Lists the current user's own chat threads (most recent first).",
    input: Input,
    output: Output,
    rbac: 'copilot.thread.read.self',
    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);
      const threads = await deps.listThreads({
        resourceId: actor.user_id,
        limit: input.limit ?? 20,
      });
      return { threads };
    },
  });
}
