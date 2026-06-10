import { listModelPrices } from '@seta/billing';

export async function billingPricingListCommand(): Promise<void> {
  const rows = await listModelPrices();
  if (rows.length === 0) {
    process.stdout.write('(no model prices set)\n');
    return;
  }
  for (const r of rows) {
    process.stdout.write(
      `${r.modelKey}\tin=${r.in}\tout=${r.out}\t${r.currency}\t${r.updatedAt.toISOString()}\n`,
    );
  }
}
