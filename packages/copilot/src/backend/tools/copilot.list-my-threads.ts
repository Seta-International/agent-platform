import { createTool } from '@mastra/core/tools';
import { actorFromContext, RequestContextSchema, registerToolPermission } from '@seta/copilot-sdk';
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
  return registerToolPermission(
    createTool({
      id: 'copilot_listMyThreads',
      description: "Lists the current user's own chat threads (most recent first).",
      inputSchema: Input,
      outputSchema: Output,
      requestContextSchema: RequestContextSchema,
      execute: async (input, ctx) => {
        const actor = actorFromContext(ctx);
        const threads = await deps.listThreads({
          resourceId: actor.user_id,
          limit: input.limit ?? 20,
        });
        return { threads };
      },
    }),
    'copilot.thread.read.self',
  );
}
