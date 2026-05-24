import type { Mastra } from '@mastra/core';
import type { CopilotTool } from '@seta/copilot-sdk';
import type { Pool } from 'pg';
import { makeListMyThreadsTool } from '../agent-tools/copilot.list-my-threads.ts';
import { ROUTER_INSTRUCTIONS, SELF_INSTRUCTIONS } from '../instructions.ts';
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
      // core + identity are foundation tier — always present.
      ...pickById(byId, [
        'core_serverTime',
        'identity_whoAmI',
        'identity_listMyRoles',
        'identity_updateMyDisplayName',
        'match_users_to_topic',
      ]),
      // Cross-module tools from optional modules are picked softly so the
      // catalog still builds in deployments that don't enable that module.
      ...pickByIdSoft(byId, ['search_tasks_semantic']),
      listMyThreads,
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
