import { eq } from 'drizzle-orm';
import { billingDb } from '../db/client.ts';
import { modelPricing } from '../db/schema/model-pricing.ts';

export interface UnitPrice {
  /** USD per input token. */
  in: number;
  /** USD per output token (0 for embeddings). */
  out: number;
}

export interface ModelPriceRow {
  modelKey: string;
  in: number;
  out: number;
  currency: string;
  updatedAt: Date;
}

/** numeric(20,10) is written as a fixed-precision string. */
function fixed10(n: number): string {
  return n.toFixed(10);
}

/** Current unit price for a model, or null if no row exists. */
export async function getModelPrice(modelKey: string): Promise<UnitPrice | null> {
  const [row] = await billingDb()
    .select({ in: modelPricing.unitPriceIn, out: modelPricing.unitPriceOut })
    .from(modelPricing)
    .where(eq(modelPricing.modelKey, modelKey))
    .limit(1);
  return row ? { in: Number(row.in), out: Number(row.out) } : null;
}

/** All prices, sorted by model_key (for the read endpoint / UI). */
export async function listModelPrices(): Promise<ModelPriceRow[]> {
  const rows = await billingDb().select().from(modelPricing).orderBy(modelPricing.modelKey);
  return rows.map((r) => ({
    modelKey: r.modelKey,
    in: Number(r.unitPriceIn),
    out: Number(r.unitPriceOut),
    currency: r.currency,
    updatedAt: r.updatedAt,
  }));
}

/** Upsert a global model price (operator action via CLI). */
export async function setModelPrice(input: {
  modelKey: string;
  in: number;
  out: number;
  currency?: string;
}): Promise<void> {
  if (input.in < 0 || input.out < 0) {
    throw new Error('unit prices must be non-negative');
  }
  const currency = input.currency ?? 'USD';
  await billingDb()
    .insert(modelPricing)
    .values({
      modelKey: input.modelKey,
      unitPriceIn: fixed10(input.in),
      unitPriceOut: fixed10(input.out),
      currency,
    })
    .onConflictDoUpdate({
      target: modelPricing.modelKey,
      set: {
        unitPriceIn: fixed10(input.in),
        unitPriceOut: fixed10(input.out),
        currency,
        updatedAt: new Date(),
      },
    });
}
