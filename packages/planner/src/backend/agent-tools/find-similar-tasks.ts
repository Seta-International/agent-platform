import type { PgVector } from '@mastra/pg';
import { actorFromContext, defineAgentTool, recordEntityExposure } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { z } from 'zod';
import { findSimilarTasks } from '../domain/find-similar-tasks.ts';
import { getPlannerVectorStore } from '../embeddings/vector-store.ts';

export const plannerFindSimilarTasksInputSchema = z.object({
  text: z.string().min(3).max(500),
  completionStatus: z
    .enum(['open', 'completed', 'any'])
    .default('open')
    .describe('"open" (default) = incomplete tasks; "completed" = done; "any" = all statuses'),
  createdWithin: z
    .enum(['week', 'month', 'any'])
    .default('any')
    .describe('"any" (default) = no date limit; "week" = last 7 days; "month" = last 30 days'),
  onlyWithReviewState: z
    .boolean()
    .default(false)
    .describe(
      'true only when the user explicitly says "need review" or "flagged for review". Default false.',
    ),
  limit: z.number().int().min(1).max(20).default(10),
});

export const plannerFindSimilarTasksOutputSchema = z.object({
  results: z.array(
    z.object({
      taskId: z.string().uuid(),
      groupId: z.string().uuid(),
      title: z.string(),
      score: z.number(),
      assigneeUserIds: z.array(z.string().uuid()),
      status: z.string(),
      reviewState: z.enum(['needs_review']).nullable(),
      skillTags: z.array(z.string()),
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
  return defineAgentTool({
    id: 'planner_findSimilarTasks',
    name: 'Find Similar Tasks',
    description:
      'Find tasks whose content matches a topic or keyword using semantic similarity.\n\n' +
      'Use for: "find tasks about onboarding"; "anything related to the API migration"; ' +
      '"who has done work like this before?"; duplicate-check before creating a task.\n' +
      'Do NOT use to filter by assignee, plan, status, skill tag, or date — ' +
      'use planner_queryTasks for those.\n\n' +
      'Results are ranked by similarity and may be slightly stale on assignee and status fields. ' +
      'Call planner_getTask for the live record before acting on a result.',
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

      const now = new Date();
      const result = await findSimilarTasks(
        {
          tenant_id: session.tenant_id,
          text: input.text,
          completionStatus: input.completionStatus,
          createdAfter:
            input.createdWithin === 'week'
              ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
              : input.createdWithin === 'month'
                ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                : undefined,
          onlyWithReviewState: input.onlyWithReviewState,
          limit: input.limit,
        },
        { provider: deps.provider, pgVector },
      );

      await recordEntityExposure(ctx as never, {
        recentTasks: result.results.map((r) => ({ taskId: r.taskId, title: r.title })),
      });

      return result;
    },
  });
}
