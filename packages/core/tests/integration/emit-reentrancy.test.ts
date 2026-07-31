import type { NodeTx } from '@seta/shared-db';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../../src/db/client.ts';
import { coreEvents } from '../../src/db/schema/index.ts';
import { CrossTenantEmitContext, emit, withEmit } from '../../src/events/index.ts';
import { withCoreTestDb } from '../helpers.ts';

/** The transaction id Postgres itself reports — proves "same transaction" by
 *  observation rather than by inference from the tx object identity. */
async function currentTxId(tx: NodeTx): Promise<string> {
  const res = await tx.execute(sql`SELECT txid_current()::text AS id`);
  return (res.rows[0] as { id: string }).id;
}

describe('withEmit() reentrancy', () => {
  it('a nested withEmit joins the outer transaction instead of opening a new one', async () => {
    await withCoreTestDb(async () => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      let outerTx = '';
      let innerTx = '';
      await withEmit({ actor: { userId: crypto.randomUUID(), tenantId } }, async (tx) => {
        outerTx = await currentTxId(tx);
        await withEmit({ actor: { userId: crypto.randomUUID(), tenantId } }, async (inner) => {
          innerTx = await currentTxId(inner);
        });
      });
      expect(innerTx).toBe(outerTx);
    });
  });

  it('a throw inside the nested body rolls the OUTER write back too', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const aggregateId = crypto.randomUUID();
      await expect(
        withEmit({ actor: { userId: crypto.randomUUID(), tenantId } }, async () => {
          await emit({
            tenantId,
            aggregateType: 'test.entity',
            aggregateId,
            eventType: 'test.entity.outer',
            eventVersion: 1,
            payload: {},
          });
          await withEmit({ actor: { userId: crypto.randomUUID(), tenantId } }, async () => {
            throw new Error('inner-thrown — the whole transaction must abort');
          });
        }),
      ).rejects.toThrow('inner-thrown');

      const rows = await db
        .select()
        .from(coreEvents)
        .where(eq(coreEvents.aggregateId, aggregateId));
      expect(rows).toHaveLength(0);
    });
  });

  it('the OUTER actor wins over an actor passed to the nested call', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const tenantId = crypto.randomUUID();
      const outerUser = crypto.randomUUID();
      const innerUser = crypto.randomUUID();
      const aggregateId = crypto.randomUUID();
      await withEmit({ actor: { userId: outerUser, tenantId } }, async () => {
        await withEmit({ actor: { userId: innerUser, tenantId } }, async () => {
          await emit({
            tenantId,
            aggregateType: 'test.entity',
            aggregateId,
            eventType: 'test.entity.nested',
            eventVersion: 1,
            payload: {},
          });
        });
      });
      const rows = await db
        .select()
        .from(coreEvents)
        .where(eq(coreEvents.aggregateId, aggregateId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.actor).toMatchObject({ user_id: outerUser });
    });
  });

  it('a nested actor from a DIFFERENT tenant throws, writes nothing, and leaves app.tenant_id alone', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const tenantA = crypto.randomUUID();
      const tenantB = crypto.randomUUID();
      const aggregateId = crypto.randomUUID();
      let gucDuring = '';
      await expect(
        withEmit({ actor: { userId: crypto.randomUUID(), tenantId: tenantA } }, async (tx) => {
          await emit({
            tenantId: tenantA,
            aggregateType: 'test.entity',
            aggregateId,
            eventType: 'test.entity.cross-tenant',
            eventVersion: 1,
            payload: {},
          });
          try {
            await withEmit(
              { actor: { userId: crypto.randomUUID(), tenantId: tenantB } },
              async () => {
                throw new Error('unreachable — the guard must fire first');
              },
            );
          } finally {
            const res = await tx.execute(
              sql`SELECT COALESCE(current_setting('app.tenant_id', true), '') AS t`,
            );
            gucDuring = (res.rows[0] as { t: string }).t;
          }
        }),
      ).rejects.toBeInstanceOf(CrossTenantEmitContext);

      expect(gucDuring).toBe(tenantA);
      const rows = await db
        .select()
        .from(coreEvents)
        .where(eq(coreEvents.aggregateId, aggregateId));
      expect(rows).toHaveLength(0);
    });
  });
});
