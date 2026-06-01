import type { EmbeddingProvider } from './provider.ts';
import { RouterEmbeddingProvider } from './router-provider.ts';

const PINNED_DIMENSIONS = 1536;
const DEFAULT_EMBED_MODEL = 'openai/text-embedding-3-small';

let cached: EmbeddingProvider | undefined;

/**
 * Singleton embedding provider for online embedding (workers, recall, agent
 * tools). Reads EMBED_MODEL ("provider/model"); asserts the model's dimension
 * matches the pinned pgvector column dimension.
 */
export function resolveEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  const modelString = process.env.EMBED_MODEL ?? DEFAULT_EMBED_MODEL;
  const provider = new RouterEmbeddingProvider(modelString);
  if (provider.dimensions !== PINNED_DIMENSIONS) {
    throw new Error(
      `EMBED_MODEL "${modelString}" emits ${provider.dimensions}-dim vectors but the pgvector columns are pinned to ${PINNED_DIMENSIONS}. ` +
        `Use a ${PINNED_DIMENSIONS}-dim model (e.g. openai/text-embedding-3-small).`,
    );
  }
  cached = provider;
  return cached;
}

/** For tests: clears the cached provider so each test can inject its own. */
export function __resetProviderCache(): void {
  cached = undefined;
}
