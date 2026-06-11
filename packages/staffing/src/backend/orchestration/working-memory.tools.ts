import {
  defineAgentTool,
  type SpecializedAgentRunCtx,
  wrapUpdateWorkingMemoryTool,
} from '@seta/agent-sdk';
import { z } from 'zod';

// Resource-scoped userContext glue for the orchestrator. The supervisor path
// gets both halves for free by attaching Memory to its Agents; the
// orchestration path must NOT do that (Mastra would auto-persist the
// orchestrator's internal messages over the manually persisted trace
// timeline), so it drives the same Memory instance through its public API:
// getSystemMessage (read → prompt section) and updateWorkingMemory (write,
// behind the same LLM guard the supervisor uses).

/** Render the userContext working-memory system message, or null when the run
 *  has no resource memory / thread (first turn, queued runner) or the read
 *  fails — prompt personalization is best-effort by design. */
export async function loadUserContextSection(ctx: SpecializedAgentRunCtx): Promise<string | null> {
  if (!ctx.userMemory || !ctx.threadId) return null;
  try {
    return await ctx.userMemory.memory.getSystemMessage({
      threadId: ctx.threadId,
      resourceId: ctx.actorUserId,
      memoryConfig: ctx.userMemory.memoryConfig,
    });
  } catch {
    return null;
  }
}

/** Build the guarded `updateWorkingMemory` tool bound to (thread, user
 *  resource), or null when the run has no resource memory. The id must stay
 *  `updateWorkingMemory` — it is the tool name Mastra's rendered
 *  working-memory instructions tell the model to call. */
export function makeUpdateWorkingMemoryTool(ctx: SpecializedAgentRunCtx) {
  const handle = ctx.userMemory;
  const threadId = ctx.threadId;
  if (!handle || !threadId) return null;
  const inner = {
    execute: async ({ memory }: { memory: string }) => {
      await handle.memory.updateWorkingMemory({
        threadId,
        resourceId: ctx.actorUserId,
        workingMemory: memory,
        memoryConfig: handle.memoryConfig,
      });
      return { success: true };
    },
  };
  const guarded = wrapUpdateWorkingMemoryTool(inner as never);
  return defineAgentTool({
    id: 'updateWorkingMemory',
    name: 'Update working memory',
    description:
      'Persist durable user-context facts to working memory.\n\n' +
      'Use for: storing timezone, communication style, current focus, preferred task view, notes.\n' +
      'Pass the FULL working-memory JSON object as a string — partial updates are not supported.',
    input: z.object({ memory: z.string() }),
    output: z.object({ success: z.boolean(), reason: z.string().optional() }),
    execute: async (input) =>
      (await guarded.execute(input, undefined)) as { success: boolean; reason?: string },
  });
}
