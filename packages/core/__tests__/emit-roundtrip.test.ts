import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { resetCoreDb } from '../src/db/client.ts';
import { coreEvents } from '../src/db/schema/index.ts';
import { emit, withEmit } from '../src/events/index.ts';
import { withCoreTestDb } from '../test/test-helpers.ts';

describe('emit() round-trip', () => {
  it('emit inside withEmit writes one row in the same transaction', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const aggregateId = crypto.randomUUID();
      await withEmit({ actor: { userId: 'u1', tenantId: 't1' } }, async () => {
        await emit({
          tenantId: crypto.randomUUID(),
          aggregateType: 'test.entity',
          aggregateId,
          eventType: 'test.entity.created',
          eventVersion: 1,
          payload: { hello: 'world' },
        });
      });

      const rows = await db
        .select()
        .from(coreEvents)
        .where(eq(coreEvents.aggregateId, aggregateId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.eventType).toBe('test.entity.created');
      expect(rows[0]?.payload).toEqual({ hello: 'world' });
      expect(rows[0]?.actor).toMatchObject({ user_id: 'u1', tenant_id: 't1' });
    });
  });

  it('returns the inserted eventId', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const aggregateId = crypto.randomUUID();
      const tenantId = crypto.randomUUID();
      let returned: { eventId: string } | undefined;
      await withEmit({ actor: { userId: 'u-1', tenantId: 't-1' } }, async () => {
        returned = await emit({
          tenantId,
          aggregateType: 'test.aggregate',
          aggregateId,
          eventType: 'test.event.returns-id',
          eventVersion: 1,
          payload: { hello: 'world' },
        });
      });
      expect(returned?.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      const rows = await db
        .select()
        .from(coreEvents)
        .where(eq(coreEvents.aggregateId, aggregateId));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toEqual(returned?.eventId);
    });
  });

  it('rollback inside withEmit drops the event row (outbox invariant)', async () => {
    await withCoreTestDb(async ({ db }) => {
      resetCoreDb();
      const aggregateId = crypto.randomUUID();
      await expect(
        withEmit(undefined, async () => {
          await emit({
            tenantId: crypto.randomUUID(),
            aggregateType: 'test.entity',
            aggregateId,
            eventType: 'test.entity.aborted',
            eventVersion: 1,
            payload: {},
          });
          throw new Error('user-thrown — rollback please');
        }),
      ).rejects.toThrow('user-thrown');
      const rows = await db
        .select()
        .from(coreEvents)
        .where(eq(coreEvents.aggregateId, aggregateId));
      expect(rows).toHaveLength(0);
    });
  });
});
