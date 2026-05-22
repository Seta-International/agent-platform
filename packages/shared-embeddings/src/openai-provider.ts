import { createOpenAI } from '@ai-sdk/openai';
import { embedMany as aiEmbedMany } from 'ai';
import type { EmbeddingProvider } from './provider.ts';

export interface OpenAIEmbeddingProviderOptions {
  apiKey: string;
  model?: 'text-embedding-3-small' | 'text-embedding-3-large';
}

const DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
};

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private readonly client: ReturnType<typeof createOpenAI>;
  private readonly modelName: 'text-embedding-3-small' | 'text-embedding-3-large';

  constructor(opts: OpenAIEmbeddingProviderOptions) {
    this.modelName = opts.model ?? 'text-embedding-3-small';
    this.dimensions = DIMENSIONS[this.modelName] ?? 1536;
    this.modelId = `openai:${this.modelName}`;
    this.client = createOpenAI({ apiKey: opts.apiKey });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { embeddings } = await aiEmbedMany({
      model: this.client.textEmbeddingModel(this.modelName),
      values: texts,
    });
    return embeddings;
  }
}
