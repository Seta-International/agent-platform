import { setModelPrice } from '@seta/billing';

export interface BillingPricingSetOpts {
  modelKey: string;
  in: number;
  out: number;
  currency?: string;
}

export async function billingPricingSetCommand(opts: BillingPricingSetOpts): Promise<void> {
  if (!Number.isFinite(opts.in) || !Number.isFinite(opts.out)) {
    throw new Error('--in and --out must be numbers (USD per token)');
  }
  await setModelPrice({
    modelKey: opts.modelKey,
    in: opts.in,
    out: opts.out,
    currency: opts.currency,
  });
  process.stdout.write(
    `${JSON.stringify({ modelKey: opts.modelKey, in: opts.in, out: opts.out, currency: opts.currency ?? 'USD' })}\n`,
  );
}
