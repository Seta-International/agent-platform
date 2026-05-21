import type { EmbeddingProvider } from './provider.ts';

export interface EmbedManyOptions {
  /** Items per provider call. */
  batchSize?: number;
  /** Total retry budget per batch. */
  maxAttempts?: number;
  /** Initial backoff before retry; each subsequent attempt doubles. */
  initialBackoffMs?: number;
}

const DEFAULTS: Required<EmbedManyOptions> = {
  batchSize: 100,
  maxAttempts: 3,
  initialBackoffMs: 200,
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Embed an array of source strings via the given provider. Splits into batches
 * of batchSize, retries each batch on failure with exponential backoff, and
 * returns vectors in input order.
 *
 * graphile-worker retries the enclosing job on failure; this layer covers
 * transient blips inside one job run. The job retry covers harder failures.
 */
export async function embedMany(
  provider: EmbeddingProvider,
  texts: string[],
  opts: EmbedManyOptions = {},
): Promise<number[][]> {
  const cfg = { ...DEFAULTS, ...opts };
  const out: number[][] = new Array(texts.length);

  for (let offset = 0; offset < texts.length; offset += cfg.batchSize) {
    const batch = texts.slice(offset, offset + cfg.batchSize);
    const vectors = await embedBatchWithRetry(provider, batch, cfg);
    for (let i = 0; i < batch.length; i += 1) {
      out[offset + i] = vectors[i] as number[];
    }
  }
  return out;
}

async function embedBatchWithRetry(
  provider: EmbeddingProvider,
  batch: string[],
  cfg: Required<EmbedManyOptions>,
): Promise<number[][]> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt += 1) {
    try {
      return await provider.embed(batch);
    } catch (err) {
      lastErr = err;
      if (attempt < cfg.maxAttempts) {
        const backoff = cfg.initialBackoffMs * 2 ** (attempt - 1);
        // Jitter spreads retry storms when many batches fail simultaneously.
        const jitter = Math.floor(Math.random() * backoff * 0.25);
        await sleep(backoff + jitter);
      }
    }
  }
  throw lastErr;
}
