import type { PgVector } from '@mastra/pg';
import { actorFromContext, defineCopilotTool } from '@seta/copilot-sdk';
import { buildActorSession } from '@seta/identity';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { z } from 'zod';
import { getPlannerVectorStore } from '../embeddings/vector-store.ts';
import { searchTasks } from '../retrieval/search-tasks.ts';

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
      source: z.literal('vector'),
    }),
  ),
  reranker: z.enum(['cohere', 'llm-judge', 'noop', 'fallback']),
});

export interface SearchTasksSemanticToolDeps {
  provider: EmbeddingProvider;
  databaseUrl?: string;
  pgVector?: PgVector;
  sessionProvider?: (actor: { user_id: string }) => Promise<{
    tenant_id: string;
    accessible_group_ids: ReadonlyArray<string>;
  }>;
}

export function searchTasksSemanticTool(deps: SearchTasksSemanticToolDeps) {
  const resolveSession = deps.sessionProvider ?? buildActorSession;
  const reranker = resolveReranker();

  return defineCopilotTool({
    id: 'search_tasks_semantic',
    name: 'Search Tasks (Semantic)',
    description:
      'Find tasks by semantic similarity over title, description, and skill tags. Returns ranked hits.',
    input: inputSchema,
    output: outputSchema,
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
                'search_tasks_semantic: either pgVector or databaseUrl must be supplied',
              );
            })());

      const requestedLimit = input.limit ?? 10;

      const { hits, reranker: usedReranker } = await searchTasks(
        {
          query: input.query,
          tenant_id: session.tenant_id,
          limit: requestedLimit,
        },
        { provider: deps.provider, pgVector, reranker },
      );

      return {
        hits: hits.map((h) => ({
          task: { task_id: h.item.task_id, title: h.item.title },
          score: h.score,
          rerank_score: h.rerankScore,
          snippet: h.item.title,
          source: h.source,
        })),
        reranker: usedReranker,
      };
    },
  });
}
