import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { Reranker } from '@seta/shared-retrieval';
import type { Pool } from 'pg';
import type { AgentTool } from './tool.ts';

export interface AgentToolFactoryDeps {
  provider: EmbeddingProvider;
  pool: Pool;
  databaseUrl: string;
  reranker: Reranker;
}

export type AgentToolFactory = (deps: AgentToolFactoryDeps) => AgentTool;
