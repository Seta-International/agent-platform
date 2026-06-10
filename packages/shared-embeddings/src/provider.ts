export interface EmbeddingUsageResult {
  /** Embeddings — input/output indices align with the source strings. */
  vectors: number[][];
  /** Total input tokens reported by the model (0 if the provider omits usage). */
  tokens: number;
}

export interface EmbeddingProvider {
  /** Stable identifier stored alongside every embedding row for drift detection. */
  readonly modelId: string;
  /** Vector dimensions emitted by this provider. */
  readonly dimensions: number;
  /** Embed an array of source strings — input/output indices align. */
  embed(texts: string[]): Promise<number[][]>;
  /** Like embed(), but also surfaces the model's reported token usage. */
  embedWithUsage(texts: string[]): Promise<EmbeddingUsageResult>;
}
