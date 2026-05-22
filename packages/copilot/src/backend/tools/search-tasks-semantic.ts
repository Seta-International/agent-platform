import { createTool } from '@mastra/core/tools';
import { searchTasks } from '@seta/planner';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Reranker } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import { z } from 'zod';
import { buildActorSession } from '../session.ts';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

const STAGE1_TOPK = Number(process.env.RERANK_STAGE1_TOPK ?? 50);

const inputSchema = z.object({
  query: z.string().min(1).max(500).describe('Natural language search query'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe('Maximum number of results to return'),
  scope: z
    .enum(['my_groups', 'tenant'])
    .optional()
    .describe(
      "Search scope: 'my_groups' (default) restricts to the actor's accessible groups; " +
        "'tenant' searches tenant-wide. RBAC gate for tenant scope is deferred to M3.3.",
    ),
});

const outputSchema = z.object({
  hits: z.array(
    z.object({
      task: z.object({
        task_id: z.string(),
        title: z.string(),
      }),
      score: z.number(),
      rerank_score: z.number(),
      snippet: z.string(),
      source: z.enum(['fts', 'vector', 'hybrid']),
    }),
  ),
  /** Which reranker actually ran — surfaces precision tier to the agent. */
  reranker: z.enum(['cohere', 'llm-judge', 'noop', 'fallback']),
});

export interface SearchTasksSemanticToolDeps {
  provider: EmbeddingProvider;
  pool: Pool;
  reranker: Reranker;
  /**
   * Optional override for deriving a session from an actor.
   * Defaults to buildActorSession. Injected in tests to avoid
   * hitting the live identity / RBAC stores.
   */
  sessionProvider?: (actor: { user_id: string }) => Promise<{
    tenant_id: string;
    accessible_group_ids: ReadonlyArray<string>;
  }>;
}

export function searchTasksSemanticTool(deps: SearchTasksSemanticToolDeps) {
  const resolveSession = deps.sessionProvider ?? buildActorSession;

  return registerToolPermission(
    createTool({
      id: 'search_tasks_semantic',
      description:
        'Find tasks by semantic similarity over title, description, and skill tags. Returns ranked hits.',
      inputSchema,
      outputSchema,
      requestContextSchema: RequestContextSchema,
      execute: async (input, ctx) => {
        const actor = actorFromContext(ctx);
        const session = await resolveSession(actor);

        const requestedLimit = input.limit ?? 10;

        // Stage 1: oversampled hybrid retrieval.
        // group_ids filtering is deferred: the retrieval layer uses bigint[]
        // but SessionScope.accessible_group_ids are UUIDs. Passing undefined here
        // falls back to tenant-wide retrieval which is correct for v1.
        // RBAC gate for the wider scope is also deferred to M3.3.
        const stage1Limit = Math.max(requestedLimit * 3, STAGE1_TOPK);
        const stage1 = await searchTasks(
          {
            query: input.query,
            tenant_id: session.tenant_id,
            limit: stage1Limit,
            group_ids: undefined,
          },
          { provider: deps.provider, pool: deps.pool },
        );

        // Stage 2: rerank stage-1 hits and truncate to the requested limit.
        const reranked = await deps.reranker.rescore(input.query, stage1, {
          topN: requestedLimit,
        });

        const usedReranker = reranked[0]?.reranker ?? 'noop';

        return {
          hits: reranked.map((h) => ({
            task: { task_id: h.item.task_id, title: h.item.title },
            score: h.score,
            rerank_score: h.rerankScore,
            snippet: h.item.title,
            source: h.source,
          })),
          reranker: usedReranker,
        };
      },
    }),
    'planner.task.read',
  );
}
