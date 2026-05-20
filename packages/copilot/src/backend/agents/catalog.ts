import type { Mastra } from '@mastra/core';
import { ROUTER_INSTRUCTIONS, SELF_INSTRUCTIONS } from '../instructions.ts';
import { makeListMyThreadsTool } from '../tools/copilot.list-my-threads.ts';
import { STATIC_SELF_TOOLS } from '../tools/self-tools.ts';
import type { AgentSpec, AgentSpecs } from './specs.ts';

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

export function buildAgentCatalog(deps: { mastra: Mastra }): AgentSpecs {
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
    tools: [...STATIC_SELF_TOOLS, listMyThreads],
    defaultTier: 'fast',
  };

  const supervisor: AgentSpec = {
    name: 'supervisor',
    label: 'Supervisor',
    description: 'Routes to the right specialist for the job',
    instructions: ROUTER_INSTRUCTIONS,
    tools: [],
    delegates: ['self'],
    defaultTier: 'fast',
  };

  return [self, supervisor];
}
