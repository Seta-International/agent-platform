import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { emitUsageObserved } from '../../src/events/emit-usage.ts';
import { withCoreTestDb } from '../helpers.ts';

const TENANT = '00000000-0000-0000-0000-0000000000aa';

async function countUsageEvents(pool: {
  query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
}): Promise<number> {
  const { rows } = await pool.query(
    `SELECT 1 FROM core.events WHERE tenant_id = $1 AND event_type = 'billing.usage.observed'`,
    [TENANT],
  );
  return rows.length;
}

describe('emitUsageObserved', () => {
  it('writes a billing.usage.observed row to core.events', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      await emitUsageObserved({
        tenantId: TENANT,
        feature: 'subagent',
        provider: 'openai',
        modelKey: 'openai/gpt-5.5',
        tokensIn: 12,
        tokensOut: 7,
        causedByUserId: null,
      });

      expect(await countUsageEvents(pool)).toBe(1);

      const { rows } = await pool.query(
        `SELECT payload FROM core.events WHERE tenant_id = $1 AND event_type = 'billing.usage.observed'`,
        [TENANT],
      );
      const payload = (rows[0] as { payload: Record<string, unknown> }).payload;
      expect(payload).toMatchObject({
        feature: 'subagent',
        provider: 'openai',
        model_key: 'openai/gpt-5.5',
        tokens_in: 12,
        tokens_out: 7,
        caused_by_user_id: null,
      });
    });
  });

  it('no-ops when both token counts are zero', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();

      await emitUsageObserved({
        tenantId: TENANT,
        feature: 'embedding',
        provider: 'openai',
        modelKey: 'openai/text-embedding-3-small',
        tokensIn: 0,
        tokensOut: 0,
        causedByUserId: null,
      });

      expect(await countUsageEvents(pool)).toBe(0);
    });
  });
});
