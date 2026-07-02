import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withEmit } from '../../src/events/index.ts';
import { withCoreTestDb } from '../helpers.ts';

describe('tenant GUC wiring', () => {
  it('withEmit sets app.tenant_id transaction-locally from the actor', async () => {
    await withCoreTestDb(async () => {
      const tenantId = randomUUID();
      await withEmit({ actor: { userId: 'u1', tenantId } }, async (tx) => {
        const r = await tx.execute(sql`SELECT current_setting('app.tenant_id', true) AS t`);
        expect((r.rows[0] as { t: string }).t).toBe(tenantId);
      });
    });
  });

  it('withEmit without an actor leaves the GUC unset', async () => {
    await withCoreTestDb(async () => {
      await withEmit(undefined, async (tx) => {
        const r = await tx.execute(sql`SELECT current_setting('app.tenant_id', true) AS t`);
        expect((r.rows[0] as { t: string | null }).t ?? '').toBe('');
      });
    });
  });
});
