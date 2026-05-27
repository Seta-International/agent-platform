import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { Memory } from '@mastra/memory';
import { PgVector } from '@mastra/pg';
import { AgentRegistry, type Domain, type SpecialistSpec } from '@seta/agent-sdk';
import { agentEnv } from './env.ts';
import { resolveModel } from './model-registry.ts';
import { generateDomainPrompt, generateTopRoutingPrompt } from './prompt-templates.ts';

export type SupervisorTree = {
  topSupervisor: Agent;
  domainAgents: Record<string, Agent>;
};

// ---------------------------------------------------------------------------
// Working memory template
// ---------------------------------------------------------------------------
const WORKING_MEMORY_TEMPLATE = `# User Context
- Timezone:
- Communication style: [e.g. Brief, Detailed]
- Current focus: [active project or initiative]
- Preferred task view: [e.g. board, list]
- Notes: [anything else worth remembering]`;

// ---------------------------------------------------------------------------
// PgVector singleton — same lazy-init pattern as getIdentityVectorStore
// ---------------------------------------------------------------------------
let cachedRecallVector: { store: PgVector; databaseUrl: string } | null = null;

function getRecallVector(databaseUrl: string): PgVector {
  if (cachedRecallVector?.databaseUrl === databaseUrl) return cachedRecallVector.store;
  if (cachedRecallVector) {
    void cachedRecallVector.store.disconnect().catch(() => {});
  }
  const store = new PgVector({
    id: 'agent-recall',
    connectionString: databaseUrl,
    schemaName: 'agent',
  });
  cachedRecallVector = { store, databaseUrl };
  return store;
}

// ---------------------------------------------------------------------------
// Memory factory
// ---------------------------------------------------------------------------
function buildMemory(opts: {
  mastra: Mastra | undefined;
  databaseUrl?: string;
}): Memory | undefined {
  const storage = opts.mastra?.getStorage();
  if (!storage) return undefined;

  const baseOpts = {
    lastMessages: agentEnv.AGENT_MEMORY_LAST_MESSAGES,
    generateTitle: true as const,
  };

  if (!opts.databaseUrl) {
    // No vector store available — sliding window only
    return new Memory({
      storage: storage as never,
      options: { ...baseOpts, semanticRecall: false },
    });
  }

  const vector = getRecallVector(opts.databaseUrl);
  const embedder = new ModelRouterEmbeddingModel('openai/text-embedding-3-small');

  return new Memory({
    storage: storage as never,
    vector,
    embedder,
    options: {
      ...baseOpts,
      generateTitle: true,
      semanticRecall: {
        topK: 5,
        messageRange: 2,
        scope: 'resource',
        indexConfig: {
          type: 'hnsw',
          metric: 'dotproduct',
          hnsw: {
            m: 16,
            efConstruction: 64,
          },
        },
      },
      workingMemory: {
        enabled: true,
        scope: 'resource',
        template: WORKING_MEMORY_TEMPLATE,
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Agent builders
// ---------------------------------------------------------------------------
function buildSpecialistAgent(spec: SpecialistSpec, memory: Memory | undefined): Agent {
  return new Agent({
    id: `${spec.domain}-${spec.id}`,
    name: spec.id,
    description: spec.description,
    instructions: spec.instructions as never,
    model: resolveModel('auto', { tierHint: 'fast' }).model as never,
    tools: spec.tools as never,
    workflows: (spec.workflows ?? {}) as never,
    ...(memory ? { memory } : {}),
  });
}

function buildDomainSupervisor(domain: Domain, memory: Memory | undefined): Agent {
  const snapshot = AgentRegistry.snapshot();
  const specialists = snapshot.specialists.filter((s) => s.domain === domain);
  const agents: Record<string, Agent> = {};
  for (const s of specialists) agents[s.id] = buildSpecialistAgent(s, memory);
  return new Agent({
    id: `${domain}-supervisor`,
    name: `${domain}-supervisor`,
    description: `Coordinates ${domain} specialists`,
    instructions: generateDomainPrompt(domain, snapshot),
    model: resolveModel('auto', { tierHint: 'balanced' }).model as never,
    agents: agents as never,
    ...(memory ? { memory } : {}),
  });
}

export function buildSupervisorTree(
  opts: { mastra?: Mastra; databaseUrl?: string } = {},
): SupervisorTree {
  const snapshot = AgentRegistry.snapshot();
  const memory = buildMemory({ mastra: opts.mastra, databaseUrl: opts.databaseUrl });
  const domainAgents: Record<string, Agent> = {};
  for (const d of snapshot.domains) domainAgents[d] = buildDomainSupervisor(d as Domain, memory);
  const topSupervisor = new Agent({
    id: 'top-supervisor',
    name: 'Supervisor',
    description: 'Top-level router. Routes every request to one domain.',
    instructions: generateTopRoutingPrompt(snapshot),
    model: resolveModel('auto', { tierHint: 'balanced' }).model as never,
    agents: domainAgents as never,
    ...(memory ? { memory } : {}),
  });
  return { topSupervisor, domainAgents };
}
