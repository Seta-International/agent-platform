import type { EmbeddingProvider } from '@seta/shared-embeddings';
import type { ComposeDeps } from '../../src/compose-registries.ts';

/**
 * Fake/no-op runtime deps for `composeRegistries()` in tests. Mirrors what
 * apps/server/src/index.ts passes at boot, minus any live model/embedding
 * provider — the registry-integrity checks only inspect registered specs
 * (ids, schemas, RBAC slugs), they never call `.run`/`.embed`, so stubs that
 * throw if actually invoked are safe here and double as a tripwire if a
 * future test starts exercising the runtimes for real.
 */
export function testComposeDeps(): ComposeDeps {
  const embeddingProvider: EmbeddingProvider = {
    modelId: 'test/unused-embedding-model',
    dimensions: 1,
    embed: () => {
      throw new Error('testComposeDeps: embed() should never be called by the integrity gate');
    },
  };

  return {
    resolveModel: () => ({}) as never,
    embeddingProvider,
  };
}
