import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { hashRoleSummary } from '@seta/core';
import { LRUCache } from 'lru-cache';
import type { ZodTypeAny } from 'zod';
import { copilotEnv } from './env.ts';
import { ROUTER_INSTRUCTIONS, SELF_INSTRUCTIONS } from './instructions.ts';
import { filterToolsByRbac } from './rbac-filter.ts';
import { type CopilotTool, toToolBag } from './tools/_types.ts';
import { makeListMyThreadsTool } from './tools/copilot.list-my-threads.ts';
import { STATIC_SELF_TOOLS } from './tools/self-tools.ts';

export type AgentName = 'router' | 'self';

export type AgentFactoryDeps = { mastra: Mastra };

type SessionLike = {
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

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

type MastraStorageWithStores = {
  stores?: { memory?: MastraMemoryStore };
};

export function createAgentFactory(deps: AgentFactoryDeps) {
  const cache = new LRUCache<string, Agent>({ max: 512 });

  return function forSession(session: SessionLike, agentName: AgentName): Agent {
    const key = `${agentName}:${hashRoleSummary(session.role_summary)}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const baseTools: CopilotTool<ZodTypeAny>[] =
      agentName === 'router'
        ? []
        : [
            ...STATIC_SELF_TOOLS,
            makeListMyThreadsTool({
              listThreads: async ({ resourceId, limit }) => {
                const storage = deps.mastra.getStorage() as MastraStorageWithStores | null;
                const memory = storage?.stores?.memory;
                if (!memory) return [];
                const { threads } = await memory.listThreads({
                  filter: { resourceId },
                  perPage: limit,
                });
                return threads.map((r) => ({
                  id: r.id,
                  resource_id: r.resourceId,
                  title: r.title ?? null,
                  updated_at: r.updatedAt ?? new Date(),
                }));
              },
            }),
          ];

    const allowedTools = filterToolsByRbac(baseTools, session);
    const tools = toToolBag(allowedTools);

    const agent = new Agent({
      id: agentName === 'router' ? 'supervisor' : 'self',
      name: agentName === 'router' ? 'Supervisor' : 'Self',
      instructions: agentName === 'router' ? ROUTER_INSTRUCTIONS : SELF_INSTRUCTIONS,
      model: resolveModel(),
      tools: tools as never,
    });
    cache.set(key, agent);
    return agent;
  };
}

function resolveModel(): string {
  return copilotEnv.COPILOT_MODEL;
}
