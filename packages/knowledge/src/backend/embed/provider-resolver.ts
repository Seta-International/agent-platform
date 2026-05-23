import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { OpenAIEmbeddingProvider } from '@seta/shared-embeddings';

let cached: EmbeddingProvider | undefined;

export function resolveEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY required for embed worker');
  const model = (process.env.EMBED_MODEL ?? 'text-embedding-3-small') as
    | 'text-embedding-3-small'
    | 'text-embedding-3-large';
  cached = new OpenAIEmbeddingProvider({ apiKey, model });
  return cached;
}

export function __resetProviderCache(): void {
  cached = undefined;
}
