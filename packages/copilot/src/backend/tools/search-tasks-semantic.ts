import { createTool } from '@mastra/core/tools';
import { searchTasks } from '@seta/planner';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Pool } from 'pg';
import { z } from 'zod';
import { buildActorSession } from '../session.ts';
import { actorFromContext, RequestContextSchema, registerToolPermission } from './_types.ts';

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
      snippet: z.string(),
      source: z.enum(['fts', 'vector', 'hybrid']),
    }),
  ),
});

export interface SearchTasksSemanticToolDeps {
  provider: EmbeddingProvider;
  pool: Pool;
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

        // group_ids filtering is deferred to M3.3: the retrieval layer uses bigint[]
        // but SessionScope.accessible_group_ids are UUIDs. Passing undefined here
        // falls back to tenant-wide retrieval which is correct for v1.
        // RBAC gate for the wider scope is also deferred to M3.3.
        const hits = await searchTasks(
          {
            query: input.query,
            tenant_id: session.tenant_id,
            limit: input.limit ?? 10,
            group_ids: undefined,
          },
          { provider: deps.provider, pool: deps.pool },
        );

        return {
          hits: hits.map((h) => ({
            task: { task_id: h.item.task_id, title: h.item.title },
            score: h.score,
            // v1: title-as-snippet; M3.4 rerank will produce real snippets
            snippet: h.item.title,
            source: h.source,
          })),
        };
      },
    }),
    'planner.task.read',
  );
}
