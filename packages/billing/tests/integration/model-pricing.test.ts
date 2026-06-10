import { describe, expect, it } from 'vitest';
import {
  getModelPrice,
  listModelPrices,
  setModelPrice,
} from '../../src/backend/domain/model-pricing.ts';
import { withBillingTestDb } from './test-helpers.ts';

describe('model pricing domain', () => {
  it('getModelPrice returns null for an unknown model', async () => {
    await withBillingTestDb(async () => {
      expect(await getModelPrice('unknown/model-x')).toBeNull();
    });
  });

  it('setModelPrice upserts and getModelPrice reads it back', async () => {
    await withBillingTestDb(async () => {
      await setModelPrice({ modelKey: 'openai/gpt-5.4-mini', in: 0.0000002, out: 0.0000008 });
      expect(await getModelPrice('openai/gpt-5.4-mini')).toEqual({ in: 0.0000002, out: 0.0000008 });

      // Upsert (same key) overwrites the price.
      await setModelPrice({ modelKey: 'openai/gpt-5.4-mini', in: 0.0000003, out: 0.0000009 });
      expect(await getModelPrice('openai/gpt-5.4-mini')).toEqual({ in: 0.0000003, out: 0.0000009 });
    });
  });

  it('listModelPrices returns seeded + set rows, sorted by model_key', async () => {
    await withBillingTestDb(async () => {
      await setModelPrice({ modelKey: 'zzz/model', in: 1, out: 2, currency: 'USD' });
      const rows = await listModelPrices();
      const keys = rows.map((r) => r.modelKey);
      // seed migration provides openai/gpt-5.5 et al; our row sorts last.
      expect(keys).toContain('openai/gpt-5.5');
      expect(keys[keys.length - 1]).toBe('zzz/model');
      const z = rows.find((r) => r.modelKey === 'zzz/model');
      expect(z).toMatchObject({ in: 1, out: 2, currency: 'USD' });
      expect(z?.updatedAt).toBeInstanceOf(Date);
    });
  });
});
