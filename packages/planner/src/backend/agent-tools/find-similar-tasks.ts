import type { PgVector } from '@mastra/pg';
import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { z } from 'zod';
import { findSimilarTasks } from '../domain/find-similar-tasks.ts';
import { getPlannerVectorStore } from '../embeddings/vector-store.ts';

export const plannerFindSimilarTasksInputSchema = z.object({
  text: z.string().min(3).max(500),
  scope: z.enum(['recent-week', 'recent-month', 'all-open', 'all']).default('recent-month'),
  limit: z.number().int().min(1).max(20).default(10),
});

export const plannerFindSimilarTasksOutputSchema = z.object({
  results: z.array(
    z.object({
      taskId: z.string().uuid(),
      title: z.string(),
      score: z.number(),
      assigneeUserIds: z.array(z.string().uuid()),
      status: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export interface PlannerFindSimilarTasksToolDeps {
  provider: EmbeddingProvider;
  databaseUrl?: string;
  pgVector?: PgVector;
  sessionProvider?: (actor: { user_id: string }) => Promise<{
    tenant_id: string;
    accessible_group_ids: ReadonlyArray<string>;
  }>;
}

export function plannerFindSimilarTasksTool(deps: PlannerFindSimilarTasksToolDeps) {
  const resolveSession = deps.sessionProvider ?? buildActorSession;
  return defineCopilotTool({
    id: 'planner_findSimilarTasks',
    name: 'Find Similar Tasks',
    description:
      'Semantic search across past tasks. Use for dedup-on-create reasoning and ' +
      'for "who has done similar work" reasoning when picking an assignee.',
    input: plannerFindSimilarTasksInputSchema,
    output: plannerFindSimilarTasksOutputSchema,
    rbac: 'planner.task.read',
    execute: async (input, ctx) => {
      const actor = actorFromContext(ctx);
      const session = await resolveSession(actor);
      const pgVector =
        deps.pgVector ??
        (deps.databaseUrl
          ? getPlannerVectorStore(deps.databaseUrl)
          : (() => {
              throw new Error(
                'planner_findSimilarTasks: either pgVector or databaseUrl must be supplied',
              );
            })());

      return findSimilarTasks(
        {
          tenant_id: session.tenant_id,
          text: input.text,
          scope: input.scope,
          limit: input.limit,
        },
        { provider: deps.provider, pgVector },
      );
    },
  });
}
