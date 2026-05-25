// Factory contract for agent tools that need runtime infrastructure to construct.
//
// Most agent tools are static and can be exported directly as `CopilotTool` values.
// Some tools (semantic search, skill-based match) require live deps — an embedding
// provider, a Postgres pool, a database URL (for module-owned vector stores), a
// reranker — that aren't available at module-import time. Those tools are exported
// as factory functions instead and contributed via `agentToolFactories` on
// `ContributionRegistry.module()`. The copilot engine instantiates them once
// during `registerCopilot` with shared deps and merges the result into the
// agent-tool pool.

import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Reranker } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import type { CopilotTool } from './tool.ts';

export interface AgentToolFactoryDeps {
  provider: EmbeddingProvider;
  pool: Pool;
  /**
   * Postgres connection string. Modules that own a Mastra-managed vector store
   * (PgVector) build it lazily from this URL inside their own factory — the SDK
   * deliberately does not hand out a pre-built PgVector because each module
   * owns its own `schemaName` and index naming.
   */
  databaseUrl: string;
  reranker: Reranker;
}

export type AgentToolFactory = (deps: AgentToolFactoryDeps) => CopilotTool;
