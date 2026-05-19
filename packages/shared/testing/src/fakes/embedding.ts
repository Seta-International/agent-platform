import { createHash } from 'node:crypto';

export interface EmbeddingLike {
  embed(text: string): Promise<number[]>;
}

export class FakeEmbeddingProvider implements EmbeddingLike {
  async embed(text: string): Promise<number[]> {
    // Deterministic 3-d vector seeded from sha256(text): equal text → equal vector;
    // different text → almost certainly different vector. Enough for assertion-level tests.
    const hash = createHash('sha256').update(text).digest();
    return [
      hash.readUInt32BE(0) / 0xff_ff_ff_ff,
      hash.readUInt32BE(4) / 0xff_ff_ff_ff,
      hash.readUInt32BE(8) / 0xff_ff_ff_ff,
    ];
  }
}
