import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { makeProjectionUpsertSubscribers } from '../../src/backend/projections/upsert-subscriber.ts';
import { withCoreTestDb } from '../helpers.ts';

const testSchema = pgSchema('projection_upsert_test');

const proj = testSchema.table('acct_proj', {
  account_id: uuid('account_id').primaryKey(),
  tenant_id: uuid('tenant_id').notNull(),
  name: text('name').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

type AcctPayload = { account_id: string; tenant_id: string; name: string };

async function seedTenant(pool: Pool): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,$2,$3)`, [
    id,
    'T',
    `t-${id.slice(0, 8)}`,
  ]);
  return id;
}

async function createTable(pool: Pool): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS projection_upsert_test`);
  await pool.query(`
    CREATE TABLE projection_upsert_test.acct_proj (
      account_id uuid PRIMARY KEY,
      tenant_id uuid NOT NULL,
      name text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function ev(tenantId: string, eventType: string, payload: AcctPayload): DomainEvent<AcctPayload> {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId,
    aggregateType: 'pm.account',
    aggregateId: payload.account_id,
    eventType,
    eventVersion: 1,
    payload,
  };
}

describe('makeProjectionUpsertSubscribers', () => {
  it('builds a created/updated pair with the exact subscription names', () => {
    const [created, updated] = makeProjectionUpsertSubscribers<AcctPayload>({
      subscriptionPrefix: 'test.acct-projection',
      createEvent: 'pm.account.created',
      updateEvent: 'pm.account.updated',
      table: proj,
      conflictTarget: proj.account_id,
      toRow: (p) => ({ account_id: p.account_id, tenant_id: p.tenant_id, name: p.name }),
    });
    expect(created.subscription).toBe('test.acct-projection.created');
    expect(created.event).toBe('pm.account.created');
    expect(updated.subscription).toBe('test.acct-projection.updated');
    expect(updated.event).toBe('pm.account.updated');
  });

  it('inserts on create and upserts idempotently on update, scoped by key', async () => {
    await withCoreTestDb(async ({ pool, db }) => {
      await createTable(pool);
      const tenant = await seedTenant(pool);
      const a = crypto.randomUUID();
      const b = crypto.randomUUID();

      const [created, updated] = makeProjectionUpsertSubscribers<AcctPayload>({
        subscriptionPrefix: 'test.acct-projection',
        createEvent: 'pm.account.created',
        updateEvent: 'pm.account.updated',
        table: proj,
        conflictTarget: proj.account_id,
        toRow: (p) => ({ account_id: p.account_id, tenant_id: p.tenant_id, name: p.name }),
      });

      // two creates (one redelivered) + one create for b
      await db.transaction(async (tx) => {
        await created.handler(
          ev(tenant, 'pm.account.created', { account_id: a, tenant_id: tenant, name: 'Acme' }),
          { tx } as never,
        );
        await created.handler(
          ev(tenant, 'pm.account.created', { account_id: a, tenant_id: tenant, name: 'Acme' }),
          { tx } as never,
        );
        await created.handler(
          ev(tenant, 'pm.account.created', { account_id: b, tenant_id: tenant, name: 'Globex' }),
          { tx } as never,
        );
      });

      // rename a via update
      await db.transaction(async (tx) => {
        await updated.handler(
          ev(tenant, 'pm.account.updated', { account_id: a, tenant_id: tenant, name: 'Acme Corp' }),
          { tx } as never,
        );
      });

      const rowA = (await db.select().from(proj).where(eq(proj.account_id, a)))[0];
      const rowB = (await db.select().from(proj).where(eq(proj.account_id, b)))[0];
      const all = await db.select().from(proj);

      expect(all.length).toBe(2); // redelivery did not duplicate
      expect(rowA?.name).toBe('Acme Corp');
      expect(rowB?.name).toBe('Globex');
    });
  });
});
