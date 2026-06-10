/**
 * Per-token prices in USD. Prices change rarely, so they live in code and are
 * snapshotted into each usage_ledger row at write time — later edits here never
 * alter historical cost (see Plan spec AC2).
 *
 * `model_key` matches packages/agent/src/backend/provider-config.ts keys, plus
 * the embedding model id from packages/shared-embeddings.
 */
export interface UnitPrice {
  /** USD per input token. */
  in: number;
  /** USD per output token (0 for embeddings). */
  out: number;
}

export const MODEL_PRICING: Record<string, UnitPrice> = {
  'openai/gpt-5.5': { in: 0.00000125, out: 0.00001 },
  'anthropic/claude-opus-4-8': { in: 0.000005, out: 0.000025 },
  'openai/text-embedding-3-small': { in: 0.00000002, out: 0 },
  mock: { in: 0, out: 0 },
};

const ZERO: UnitPrice = { in: 0, out: 0 };

/** Returns the unit price for a model key, or zero (with a warning) if unknown. */
export function priceFor(modelKey: string): UnitPrice {
  const p = MODEL_PRICING[modelKey];
  if (!p) {
    console.warn('[billing.pricing.unknown-model]', { modelKey });
    return ZERO;
  }
  return p;
}
