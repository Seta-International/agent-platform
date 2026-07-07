import { resolveEmbeddingProvider } from '@seta/shared-embeddings';
import { resolveReranker } from '@seta/shared-retrieval';
import { getPlannerVectorStore } from '../../embeddings/vector-store.ts';
import type { AssignBySkillDeps } from './workflow.ts';

/**
 * Default runtime deps for the assignBySkill pipeline (embedding provider,
 * pgvector store, reranker). Shared by the workflow compute step and the
 * inline suggestTaskAssignees read so both use identical ranking inputs.
 */
export function defaultAssignBySkillDeps(): AssignBySkillDeps {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL required for assignBySkill suggestions');
  return {
    provider: resolveEmbeddingProvider(),
    pgVector: getPlannerVectorStore(databaseUrl),
    reranker: resolveReranker(),
  };
}
