import type { Mastra } from '@mastra/core';
import type { CopilotTool } from '@seta/copilot-sdk';
import { matchUsersToTopicTool } from '@seta/identity/agent-tools';
import { searchTasksSemanticTool } from '@seta/planner/agent-tools';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import { resolveEmbeddingProvider } from '../embedding-provider.ts';
import { ROUTER_INSTRUCTIONS, SELF_INSTRUCTIONS } from '../instructions.ts';
import { makeListMyThreadsTool } from '../tools/copilot.list-my-threads.ts';
import type { AgentSpec, AgentSpecs } from './specs.ts';

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

function indexById(tools: ReadonlyArray<CopilotTool>): Map<string, CopilotTool> {
  const bag = new Map<string, CopilotTool>();
  for (const t of tools) {
    const id = (t as { id?: string }).id;
    if (id) bag.set(id, t);
  }
  return bag;
}

function pickById(byId: Map<string, CopilotTool>, ids: string[]): CopilotTool[] {
  return ids.map((id) => {
    const t = byId.get(id);
    if (!t) throw new Error(`agent-catalog: tool not registered: ${id}`);
    return t;
  });
}

function pickByIdSoft(byId: Map<string, CopilotTool>, ids: string[]): CopilotTool[] {
  const out: CopilotTool[] = [];
  for (const id of ids) {
    const t = byId.get(id);
    if (t) out.push(t);
  }
  return out;
}

export function buildAgentCatalog(deps: {
  mastra: Mastra;
  pool: Pool;
  agentTools: ReadonlyArray<CopilotTool>;
}): AgentSpecs {
  const provider = makeLazyProvider();
  const byId = indexById(deps.agentTools);

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
      ...pickById(byId, [
        'core_serverTime',
        'identity_whoAmI',
        'identity_listMyRoles',
        'identity_updateMyDisplayName',
      ]),
      listMyThreads,
      searchTasksSemanticTool({ provider, pool: deps.pool, reranker }),
      matchUsersToTopicTool({ provider, pool: deps.pool, reranker }),
    ],
    defaultTier: 'fast',
  };

  const supervisor: AgentSpec = {
    name: 'supervisor',
    label: 'Supervisor',
    description: 'Routes to the right specialist for the job',
    instructions: ROUTER_INSTRUCTIONS,
    tools: pickByIdSoft(byId, ['staffing_runNewTaskSkillTag']),
    delegates: ['self'],
    defaultTier: 'fast',
  };

  return [self, supervisor];
}
