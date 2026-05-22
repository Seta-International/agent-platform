import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { hashRoleSummary } from '@seta/core';
import { LRUCache } from 'lru-cache';
import type { Pool } from 'pg';
import { buildAgentCatalog } from './agents/catalog.ts';
import { type AgentSpec, type AgentSpecs, findSpec, listAgentNames } from './agents/specs.ts';
import { resolveModel } from './model-registry.ts';
import { filterToolsByRbac } from './rbac-filter.ts';
import { type CopilotTool, RequestContextSchema } from './tools/_types.ts';

export type AgentFactoryDeps = {
  mastra: Mastra;
  pool: Pool;
  agentTools: ReadonlyArray<CopilotTool>;
};

type SessionLike = {
  effective_permissions: ReadonlySet<string>;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
};

export interface SessionAgents {
  get(name: string): Agent | undefined;
  names(): string[];
  specs(): AgentSpecs;
}

export interface AgentFactory {
  (session: SessionLike): SessionAgents;
  specs: AgentSpecs;
  names: string[];
}

function toolsRecord(tools: ReadonlyArray<CopilotTool>): Record<string, CopilotTool> {
  const bag: Record<string, CopilotTool> = {};
  for (const t of tools) {
    const id = (t as { id?: string }).id;
    if (!id) throw new Error('Copilot tool is missing its required id field');
    bag[id] = t;
  }
  return bag;
}

export function createAgentFactory(deps: AgentFactoryDeps): AgentFactory {
  const specs = buildAgentCatalog({
    mastra: deps.mastra,
    pool: deps.pool,
    agentTools: deps.agentTools,
  });
  const cache = new LRUCache<string, Map<string, Agent>>({ max: 256 });

  function buildAgents(session: SessionLike): Map<string, Agent> {
    const storage = deps.mastra.getStorage();
    const memory = storage
      ? new Memory({
          storage: storage as never,
          options: { semanticRecall: false, generateTitle: true },
        })
      : undefined;

    const byName = new Map<string, Agent>();
    const buildOne = (spec: AgentSpec): Agent => {
      const cached = byName.get(spec.name);
      if (cached) return cached;
      const allowed = filterToolsByRbac(spec.tools, session);
      const subAgents: Record<string, Agent> = {};
      for (const target of spec.delegates ?? []) {
        const targetSpec = findSpec(specs, target);
        if (!targetSpec) continue;
        subAgents[target] = buildOne(targetSpec);
      }
      const agent = new Agent({
        id: spec.name,
        name: spec.label,
        description: spec.description,
        instructions: spec.instructions,
        model: resolveModel(undefined, { tierHint: spec.defaultTier }).model,
        tools: toolsRecord(allowed) as never,
        requestContextSchema: RequestContextSchema as never,
        mastra: deps.mastra,
        ...(Object.keys(subAgents).length > 0 ? { agents: subAgents as never } : {}),
        ...(memory ? { memory } : {}),
      });
      byName.set(spec.name, agent);
      return agent;
    };

    for (const spec of specs) buildOne(spec);
    return byName;
  }

  const factory = ((session) => {
    const key = hashRoleSummary(session.role_summary);
    let bag = cache.get(key);
    if (!bag) {
      bag = buildAgents(session);
      cache.set(key, bag);
    }
    const local = bag;
    return {
      get: (name) => local.get(name),
      names: () => Array.from(local.keys()),
      specs: () => specs,
    };
  }) as AgentFactory;

  factory.specs = specs;
  factory.names = listAgentNames(specs);
  return factory;
}
