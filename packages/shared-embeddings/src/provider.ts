export interface EmbeddingProvider {
  /** Stable identifier stored alongside every embedding row for drift detection. */
  readonly modelId: string;
  /** Vector dimensions emitted by this provider. */
  readonly dimensions: number;
  /** Embed an array of source strings — input/output indices align. */
  embed(texts: string[]): Promise<number[][]>;
}
