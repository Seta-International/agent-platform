import { EMBEDDING_MODELS, ModelRouterEmbeddingModel } from '@mastra/core/llm';
import type { EmbeddingProvider, EmbeddingUsageResult } from './provider.ts';

/** Embedding provider backed by Mastra's model router. Accepts "provider/model". */
export class RouterEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private readonly router: ModelRouterEmbeddingModel;

  constructor(modelString: string) {
    const slash = modelString.indexOf('/');
    if (slash <= 0) {
      throw new Error(`EMBED_MODEL must be "provider/model", got "${modelString}"`);
    }
    const provider = modelString.slice(0, slash);
    const model = modelString.slice(slash + 1);

    const info = EMBEDDING_MODELS.find((m) => m.id === model && m.provider === provider);
    if (!info) {
      throw new Error(
        `Unknown embedding model "${modelString}" — no dimensions in Mastra's registry`,
      );
    }
    this.dimensions = info.dimensions;
    this.modelId = `${provider}:${model}`;
    this.router = new ModelRouterEmbeddingModel(modelString);
  }

  async embedWithUsage(texts: string[]): Promise<EmbeddingUsageResult> {
    if (texts.length === 0) return { vectors: [], tokens: 0 };
    const { embeddings, usage } = await this.router.doEmbed({ values: texts });
    return { vectors: embeddings as number[][], tokens: usage?.tokens ?? 0 };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return (await this.embedWithUsage(texts)).vectors;
  }
}
