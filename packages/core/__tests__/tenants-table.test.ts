import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  coreEvents,
  coreSubscriptionCursors,
  coreSubscriptionDeadLetter,
  coreSubscriptionProcessed,
  coreTenants,
} from '../src/db/schema/index.ts';
import { withCoreTestDb } from '../test/test-helpers.ts';

describe('core schema', () => {
  it('tenants table accepts inserts', async () => {
    await withCoreTestDb(async ({ db }) => {
      const id = crypto.randomUUID();
      await db.insert(coreTenants).values({ id, name: 'Acme', slug: 'acme' });
      const rows = await db.select().from(coreTenants).where(eq(coreTenants.id, id));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('Acme');
    });
  });

  it('events table is partitioned and accepts inserts into the current month', async () => {
    await withCoreTestDb(async ({ db, pool }) => {
      await db.insert(coreEvents).values({
        id: crypto.randomUUID(),
        tenantId: crypto.randomUUID(),
        aggregateType: 'test.entity',
        aggregateId: crypto.randomUUID(),
        eventType: 'test.entity.happened',
        eventVersion: 1,
        payload: { x: 1 },
      });
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM core.events WHERE event_type='test.entity.happened'`,
      );
      expect(rows[0]?.n).toBe(1);

      const parts = await pool.query(
        `SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = 'core.events'::regclass`,
      );
      expect(parts.rows[0]?.n).toBeGreaterThan(0);
    });
  });

  it('subscription tables exist', async () => {
    await withCoreTestDb(async ({ db }) => {
      const cursors = await db.select().from(coreSubscriptionCursors);
      const processed = await db.select().from(coreSubscriptionProcessed);
      const dlq = await db.select().from(coreSubscriptionDeadLetter);
      expect(cursors).toEqual([]);
      expect(processed).toEqual([]);
      expect(dlq).toEqual([]);
    });
  });

  it('audit_v view returns rows with non-null actor', async () => {
    await withCoreTestDb(async ({ db, pool }) => {
      const id = crypto.randomUUID();
      await db.insert(coreEvents).values({
        id,
        tenantId: crypto.randomUUID(),
        aggregateType: 'test.entity',
        aggregateId: crypto.randomUUID(),
        eventType: 'test.entity.audited',
        eventVersion: 1,
        payload: {},
        actor: { user_id: 'u1', tenant_id: 't1' },
      });
      const { rows } = await pool.query(`SELECT event_id FROM core.audit_v WHERE event_id=$1`, [
        id,
      ]);
      expect(rows).toHaveLength(1);
    });
  });
});
