import type { Mastra } from '@mastra/core';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import { resolveEmbeddingProvider } from '../embeddings/provider-resolver.ts';
import { ROUTER_INSTRUCTIONS, SELF_INSTRUCTIONS } from '../instructions.ts';
import { makeListMyThreadsTool } from '../tools/copilot.list-my-threads.ts';
import { copilotRunNewTaskSkillTagTool } from '../tools/copilot.run-new-task-skill-tag.ts';
import { matchUsersToTopicTool } from '../tools/match-users-to-topic.ts';
import { searchTasksSemanticTool } from '../tools/search-tasks-semantic.ts';
import { searchTenantKnowledgeTool } from '../tools/search-tenant-knowledge.ts';
import { STATIC_SELF_TOOLS } from '../tools/self-tools.ts';
import type { AgentSpec, AgentSpecs } from './specs.ts';

// Resolved once at module load — avoids re-reading env on every agent catalog rebuild.
const reranker = resolveReranker();

type MastraStorageThreadRow = {
  id: string;
  resourceId: string;
  title?: string | null;
  updatedAt?: Date;
};

type MastraMemoryStore = {
  listThreads: (q: {
    filter?: { resourceId?: string };
    perPage?: number | false;
  }) => Promise<{ threads: MastraStorageThreadRow[] }>;
};

type MastraStorageWithStores = { stores?: { memory?: MastraMemoryStore } };

/** Lazily-resolved proxy: Provider is resolved on first property or method access. */
function makeLazyProvider(): EmbeddingProvider {
  let inner: EmbeddingProvider | undefined;
  const get = (): EmbeddingProvider => (inner ??= resolveEmbeddingProvider());
  return {
    get modelId() {
      return get().modelId;
    },
    get dimensions() {
      return get().dimensions;
    },
    embed: (...args) => get().embed(...args),
  };
}

export function buildAgentCatalog(deps: { mastra: Mastra; pool: Pool }): AgentSpecs {
  const provider = makeLazyProvider();
  const listMyThreads = makeListMyThreadsTool({
    listThreads: async ({ resourceId, limit }) => {
      const storage = deps.mastra.getStorage() as MastraStorageWithStores | null;
      const memory = storage?.stores?.memory;
      if (!memory) return [];
      const { threads } = await memory.listThreads({ filter: { resourceId }, perPage: limit });
      return threads.map((r) => ({
        id: r.id,
        resource_id: r.resourceId,
        title: r.title ?? null,
        updated_at: r.updatedAt ?? new Date(),
      }));
    },
  });

  const self: AgentSpec = {
    name: 'self',
    label: 'Self',
    description: 'Answers questions about your account, roles, and recent threads',
    instructions: SELF_INSTRUCTIONS,
    tools: [
      ...STATIC_SELF_TOOLS,
      listMyThreads,
      searchTasksSemanticTool({ provider, pool: deps.pool, reranker }),
      matchUsersToTopicTool({ provider, pool: deps.pool, reranker }),
      searchTenantKnowledgeTool({ provider, pool: deps.pool, reranker }),
    ],
    defaultTier: 'fast',
  };

  const supervisor: AgentSpec = {
    name: 'supervisor',
    label: 'Supervisor',
    description: 'Routes to the right specialist for the job',
    instructions: ROUTER_INSTRUCTIONS,
    tools: [copilotRunNewTaskSkillTagTool],
    delegates: ['self'],
    defaultTier: 'fast',
  };

  return [self, supervisor];
}
