import { and, eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { queryAudit } from '../../src/backend/audit.ts';
import { resetCoreDb } from '../../src/db/client.ts';
import { mutationIdempotency } from '../../src/db/schema/index.ts';
import { emit, withEmit, withGatedMutation } from '../../src/events/index.ts';
import { withCoreTestDb } from '../helpers.ts';

/** A stand-in for a feature table so this test owns no module dependency. */
async function createWidgetTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS core.gateway_test_widget (
      id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      label text NOT NULL
    )`);
}

function session(tenantId: string) {
  return { user_id: crypto.randomUUID(), tenant_id: tenantId };
}

/** The body under test: inserts one widget and emits one event, exactly like a
 *  domain function would — it joins the gateway transaction via reentrant withEmit. */
function makeBody(tenantId: string, widgetId: string, label: string) {
  return async () => {
    await withEmit(undefined, async (tx) => {
      await tx.execute(
        sql`INSERT INTO core.gateway_test_widget (id, tenant_id, label)
            VALUES (${widgetId}::uuid, ${tenantId}::uuid, ${label})`,
      );
      await emit({
        tenantId,
        aggregateType: 'widget',
        aggregateId: widgetId,
        eventType: 'widget.created',
        eventVersion: 1,
        payload: { label },
      });
    });
    return { widgetId };
  };
}

async function widgetCount(pool: Pool, widgetId: string): Promise<number> {
  const r = await pool.query(
    'SELECT count(*)::int AS n FROM core.gateway_test_widget WHERE id = $1',
    [widgetId],
  );
  return r.rows[0].n as number;
}

describe('withGatedMutation()', () => {
  it('the same key twice, sequentially: one write, one event, the same result returned', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      await createWidgetTable(pool);
      const tenantId = crypto.randomUUID();
      const s = session(tenantId);
      const widgetId = crypto.randomUUID();
      const opts = {
        idempotencyKey: crypto.randomUUID(),
        onBehalfOf: s.user_id,
        actorKind: 'agent' as const,
        mutationKind: 'create' as const,
      };

      const first = await withGatedMutation(s, opts, makeBody(tenantId, widgetId, 'one'));
      const second = await withGatedMutation(
        s,
        opts,
        makeBody(tenantId, crypto.randomUUID(), 'two'),
      );

      expect(first.replayed).toBe(false);
      expect(second.replayed).toBe(true);
      expect(second.result).toEqual(first.result);
      expect(await widgetCount(pool, widgetId)).toBe(1);
      const { rows } = await queryAudit({ tenant_id: tenantId, limit: 10, offset: 0 });
      expect(rows).toHaveLength(1);
    });
  });

  it('the same key concurrently: one winner, one replay, exactly one row written', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      await createWidgetTable(pool);
      const tenantId = crypto.randomUUID();
      const s = session(tenantId);
      const idA = crypto.randomUUID();
      const idB = crypto.randomUUID();
      const opts = {
        idempotencyKey: crypto.randomUUID(),
        onBehalfOf: s.user_id,
        actorKind: 'agent' as const,
        mutationKind: 'create' as const,
      };

      const [a, b] = await Promise.all([
        withGatedMutation(s, opts, makeBody(tenantId, idA, 'a')),
        withGatedMutation(s, opts, makeBody(tenantId, idB, 'b')),
      ]);

      expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
      const total = (await widgetCount(pool, idA)) + (await widgetCount(pool, idB));
      expect(total).toBe(1);
    });
  });

  it('the same key under two DIFFERENT tenants: two independent rows, neither replays', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      await createWidgetTable(pool);
      const key = crypto.randomUUID();
      const tenantA = crypto.randomUUID();
      const tenantB = crypto.randomUUID();
      const idA = crypto.randomUUID();
      const idB = crypto.randomUUID();
      const opts = () => ({
        idempotencyKey: key,
        onBehalfOf: crypto.randomUUID(),
        actorKind: 'agent' as const,
        mutationKind: 'create' as const,
      });

      const a = await withGatedMutation(session(tenantA), opts(), makeBody(tenantA, idA, 'a'));
      const b = await withGatedMutation(session(tenantB), opts(), makeBody(tenantB, idB, 'b'));

      expect(a.replayed).toBe(false);
      expect(b.replayed).toBe(false);
      expect(await widgetCount(pool, idA)).toBe(1);
      expect(await widgetCount(pool, idB)).toBe(1);
    });
  });

  it('RLS: tenant B cannot see tenant A key row', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      await createWidgetTable(pool);
      const tenantA = crypto.randomUUID();
      const tenantB = crypto.randomUUID();
      const key = crypto.randomUUID();
      const s = session(tenantA);
      await withGatedMutation(
        s,
        { idempotencyKey: key, onBehalfOf: s.user_id, actorKind: 'agent', mutationKind: 'create' },
        makeBody(tenantA, crypto.randomUUID(), 'a'),
      );

      // The test superuser bypasses RLS, so read as the least-privilege app role —
      // the same technique the core RLS census uses.
      await pool.query('CREATE ROLE seta_app NOSUPERUSER NOBYPASSRLS').catch(() => {});
      await pool.query('GRANT USAGE ON SCHEMA core TO seta_app');
      await pool.query('GRANT SELECT ON core.mutation_idempotency TO seta_app');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE seta_app');
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantB]);
        const seenByB = await client.query(
          'SELECT count(*)::int AS n FROM core.mutation_idempotency WHERE key = $1',
          [key],
        );
        expect(seenByB.rows[0].n).toBe(0);

        // ...and the owning tenant still sees it, so the 0 above is isolation, not a
        // missing row or a broken grant.
        await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantA]);
        const seenByA = await client.query(
          'SELECT count(*)::int AS n FROM core.mutation_idempotency WHERE key = $1',
          [key],
        );
        expect(seenByA.rows[0].n).toBe(1);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });
  });

  it('the body throwing leaves no key row, no event and no write — and the key still works afterwards', async () => {
    await withCoreTestDb(async ({ pool, db }) => {
      resetCoreDb();
      await createWidgetTable(pool);
      const tenantId = crypto.randomUUID();
      const s = session(tenantId);
      const key = crypto.randomUUID();
      const widgetId = crypto.randomUUID();
      const opts = {
        idempotencyKey: key,
        onBehalfOf: s.user_id,
        actorKind: 'agent' as const,
        mutationKind: 'create' as const,
      };

      await expect(
        withGatedMutation(s, opts, async () => {
          await makeBody(tenantId, widgetId, 'doomed')();
          throw new Error('domain-thrown');
        }),
      ).rejects.toThrow('domain-thrown');

      expect(await widgetCount(pool, widgetId)).toBe(0);
      const keyRows = await db
        .select()
        .from(mutationIdempotency)
        .where(and(eq(mutationIdempotency.tenant_id, tenantId), eq(mutationIdempotency.key, key)));
      expect(keyRows).toHaveLength(0);
      const { rows } = await queryAudit({ tenant_id: tenantId, limit: 10, offset: 0 });
      expect(rows).toHaveLength(0);

      const retry = await withGatedMutation(s, opts, makeBody(tenantId, widgetId, 'for-real'));
      expect(retry.replayed).toBe(false);
      expect(await widgetCount(pool, widgetId)).toBe(1);
    });
  });

  it('several domain calls in one gateway call, one throwing: zero rows changed', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      await createWidgetTable(pool);
      const tenantId = crypto.randomUUID();
      const s = session(tenantId);
      const first = crypto.randomUUID();
      const second = crypto.randomUUID();

      await expect(
        withGatedMutation(
          s,
          {
            idempotencyKey: crypto.randomUUID(),
            onBehalfOf: s.user_id,
            actorKind: 'agent',
            mutationKind: 'bulk_update',
          },
          async () => {
            await makeBody(tenantId, first, 'ok')();
            await makeBody(tenantId, second, 'ok')();
            throw new Error('third-one-failed');
          },
        ),
      ).rejects.toThrow('third-one-failed');

      expect(await widgetCount(pool, first)).toBe(0);
      expect(await widgetCount(pool, second)).toBe(0);
    });
  });

  it('snapshot() fills before/after on every event the body emitted', async () => {
    await withCoreTestDb(async ({ pool }) => {
      resetCoreDb();
      await createWidgetTable(pool);
      const tenantId = crypto.randomUUID();
      const s = session(tenantId);
      const widgetId = crypto.randomUUID();

      await withGatedMutation(
        s,
        {
          idempotencyKey: crypto.randomUUID(),
          onBehalfOf: s.user_id,
          actorKind: 'agent',
          mutationKind: 'create',
          snapshot: async (tx) => {
            const r = await tx.execute(
              sql`SELECT count(*)::int AS n FROM core.gateway_test_widget
                   WHERE tenant_id = ${tenantId}::uuid`,
            );
            return { widgets: (r.rows[0] as { n: number }).n };
          },
        },
        makeBody(tenantId, widgetId, 'snapshotted'),
      );

      const { rows } = await queryAudit({ tenant_id: tenantId, limit: 10, offset: 0 });
      expect(rows[0]?.before).toEqual({ widgets: 0 });
      expect(rows[0]?.after).toEqual({ widgets: 1 });
      expect(rows[0]?.actor).toMatchObject({ actor_kind: 'agent', on_behalf_of: s.user_id });
    });
  });
});
