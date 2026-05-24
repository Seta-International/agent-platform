import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import type { AgentToolFactoryDeps, CopilotTool } from '@seta/copilot-sdk';
import type { AgentSpec, ContributionRegistry } from '@seta/core';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import type { Hono } from 'hono';
import type { Pool } from 'pg';
import { createAgentFactory } from './backend/agent-factory.ts';
import * as schema from './backend/db/schema.ts';
import { resolveEmbeddingProvider } from './backend/embedding-provider.ts';
import { type ModelTier, resolveModel } from './backend/model-registry.ts';
import { registerCopilotRoutes } from './backend/routes.ts';
import { buildMastra } from './backend/runtime.ts';
import { registerWorkflowInputSchema } from './backend/workflows/_infra/input-schema-registry.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerCopilotContributions(reg: ContributionRegistry): void {
  reg.module({
    name: 'copilot',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle'),
  });
}

export type CopilotHandle = {
  attach: (app: Hono) => void;
  mastra: Mastra;
};

// Lazy proxy around `resolveEmbeddingProvider`: defers reading OPENAI_API_KEY
// until the first `.embed()` call so apps/tests that never trigger semantic
// search don't pay the boot-time env requirement.
function makeLazyEmbeddingProvider(): EmbeddingProvider {
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

// Construct a Mastra Agent from a module-contributed spec. Used by registerCopilot
// for production wiring and by the testing subpath for integration tests that
// build their own Mastra; tests override `model` to swap in a mock.
export function buildAgentFromSpec(spec: AgentSpec, opts: { model?: unknown } = {}): Agent {
  const model =
    opts.model ??
    resolveModel(undefined, { tierHint: spec.defaultTier as ModelTier | undefined }).model;
  return new Agent({
    id: spec.id,
    name: spec.id,
    instructions: spec.instructions,
    model: model as never,
  });
}

export function registerCopilot(deps: {
  pool: Pool;
  databaseUrl: string;
  reg: ContributionRegistry;
}): CopilotHandle {
  const mastra = buildMastra({ pool: deps.pool, databaseUrl: deps.databaseUrl });

  for (const spec of deps.reg.collected.agentSpecs) {
    mastra.addAgent(buildAgentFromSpec(spec));
  }

  for (const { contribution } of deps.reg.collected.workflowContributions) {
    contribution.build(mastra);
    if (contribution.inputSchema) {
      registerWorkflowInputSchema(contribution.id, contribution.inputSchema);
    }
  }
  void mastra.startWorkers();

  // Embedding provider resolution is deferred: tests that don't exercise
  // semantic-search tools must not require OPENAI_API_KEY at boot.
  const factoryDeps: AgentToolFactoryDeps = {
    provider: makeLazyEmbeddingProvider(),
    pool: deps.pool,
    reranker: resolveReranker(),
  };
  const builtFactoryTools: CopilotTool[] = deps.reg.collected.agentToolFactories.map(
    ({ factory }) => factory(factoryDeps),
  );

  const factory = createAgentFactory({
    mastra,
    pool: deps.pool,
    agentTools: [...deps.reg.collected.agentTools, ...builtFactoryTools],
  });
  return {
    attach(app) {
      registerCopilotRoutes(app as never, { factory, mastra, pool: deps.pool });
    },
    mastra,
  };
}
