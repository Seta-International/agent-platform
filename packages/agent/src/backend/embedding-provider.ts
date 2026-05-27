import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { OpenAIEmbeddingProvider } from '@seta/shared-embeddings';

let cached: EmbeddingProvider | undefined;

/**
 * Lazily constructs the singleton EmbeddingProvider used by agent-catalog tools.
 * Reads OPENAI_API_KEY + EMBED_MODEL from the environment. The catalog wraps
 * this in a lazy proxy so resolution is deferred until the first embed() call.
 */
export function resolveEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for embedding-backed agent tools');
  const model = (process.env.EMBED_MODEL ?? 'text-embedding-3-small') as
    | 'text-embedding-3-small'
    | 'text-embedding-3-large';
  cached = new OpenAIEmbeddingProvider({ apiKey, model });
  return cached;
}
