import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from '@seta/shared-embeddings';

export interface FakeEmbeddingProviderOptions {
  dimensions?: number;
}

/**
 * Deterministic embedding provider for tests. Computes a stable per-input vector
 * by hashing the input and scaling its bytes into a unit-norm Float64 vector of
 * the requested dimension.
 *
 * Same input → same vector across runs (load-bearing for hash-gate tests).
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = 'fake:deterministic-hash';
  readonly dimensions: number;

  constructor(opts: FakeEmbeddingProviderOptions = {}) {
    this.dimensions = opts.dimensions ?? 1536;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.vectorize(t));
  }

  private vectorize(text: string): number[] {
    const out = new Array<number>(this.dimensions);
    let acc = 0;
    let i = 0;
    while (i < this.dimensions) {
      const seed = `${text}|${Math.floor(i / 32)}`;
      const digest = createHash('sha256').update(seed).digest();
      for (let j = 0; j < 32 && i < this.dimensions; j += 1, i += 1) {
        const v = (digest[j] as number) / 127.5 - 1;
        out[i] = v;
        acc += v * v;
      }
    }
    const norm = Math.sqrt(acc) || 1;
    for (let k = 0; k < this.dimensions; k += 1) {
      out[k] = (out[k] as number) / norm;
    }
    return out;
  }
}
