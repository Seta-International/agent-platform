import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { makeSkillRenamedSubscriber } from '../../src/backend/skills/skill-renamed-subscriber.ts';
import { CORE_SKILL_RENAMED, type SkillRenamedEventPayload } from '../../src/index.ts';
import { withCoreTestDb } from '../helpers.ts';

const testSchema = pgSchema('skill_renamed_subscriber_test');

const cacheOne = testSchema.table('cache_one', {
  tenant_id: uuid('tenant_id').notNull(),
  skill_id: uuid('skill_id').notNull(),
  skill_name: text('skill_name').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

const cacheTwo = testSchema.table('cache_two', {
  tenant_id: uuid('tenant_id').notNull(),
  skill_id: uuid('skill_id').notNull(),
  skill_name: text('skill_name').notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

async function seedTenant(pool: Pool): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,$2,$3)`, [
    id,
    'T',
    `t-${id.slice(0, 8)}`,
  ]);
  return id;
}

async function createCacheTables(pool: Pool): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS skill_renamed_subscriber_test`);
  await pool.query(`
    CREATE TABLE skill_renamed_subscriber_test.cache_one (
      tenant_id uuid NOT NULL,
      skill_id uuid NOT NULL,
      skill_name text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE skill_renamed_subscriber_test.cache_two (
      tenant_id uuid NOT NULL,
      skill_id uuid NOT NULL,
      skill_name text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

function renamedEvent(
  tenantId: string,
  payload: SkillRenamedEventPayload,
): DomainEvent<SkillRenamedEventPayload> {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date(),
    tenantId,
    aggregateType: 'core.skill',
    aggregateId: payload.skill_id,
    eventType: CORE_SKILL_RENAMED,
    eventVersion: 1,
    payload,
  };
}

describe('makeSkillRenamedSubscriber', () => {
  it('updates skill_name only for the matching tenant + skill', async () => {
    await withCoreTestDb(async ({ pool, db }) => {
      await createCacheTables(pool);

      const tenantA = await seedTenant(pool);
      const tenantB = await seedTenant(pool);
      const skillId = crypto.randomUUID();
      const otherSkillId = crypto.randomUUID();

      await db.insert(cacheOne).values([
        { tenant_id: tenantA, skill_id: skillId, skill_name: 'TypeScript' },
        { tenant_id: tenantB, skill_id: skillId, skill_name: 'TypeScript' },
        { tenant_id: tenantA, skill_id: otherSkillId, skill_name: 'Go' },
      ]);

      const subscriber = makeSkillRenamedSubscriber({
        subscription: 'test.cache_one.skill_renamed',
        tables: [cacheOne],
      });

      expect(subscriber.event).toBe(CORE_SKILL_RENAMED);
      expect(subscriber.eventVersion).toBe(1);
      expect(subscriber.subscription).toBe('test.cache_one.skill_renamed');

      const payload: SkillRenamedEventPayload = {
        skill_id: skillId,
        name: 'TS',
        previous_name: 'TypeScript',
      };

      await db.transaction(async (tx) => {
        await subscriber.handler(renamedEvent(tenantA, payload), { tx } as never);
      });

      const rows = await db.select().from(cacheOne).orderBy(cacheOne.tenant_id);

      const renamedRow = rows.find((r) => r.tenant_id === tenantA && r.skill_id === skillId);
      const untouchedTenantRow = rows.find(
        (r) => r.tenant_id === tenantB && r.skill_id === skillId,
      );
      const untouchedSkillRow = rows.find(
        (r) => r.tenant_id === tenantA && r.skill_id === otherSkillId,
      );

      expect(renamedRow?.skill_name).toBe('TS');
      expect(untouchedTenantRow?.skill_name).toBe('TypeScript');
      expect(untouchedSkillRow?.skill_name).toBe('Go');
    });
  });

  it('updates skill_name on every table passed in', async () => {
    await withCoreTestDb(async ({ pool, db }) => {
      await createCacheTables(pool);

      const tenantId = await seedTenant(pool);
      const skillId = crypto.randomUUID();

      await db
        .insert(cacheOne)
        .values({ tenant_id: tenantId, skill_id: skillId, skill_name: 'Rust' });
      await db
        .insert(cacheTwo)
        .values({ tenant_id: tenantId, skill_id: skillId, skill_name: 'Rust' });

      const subscriber = makeSkillRenamedSubscriber({
        subscription: 'test.multi.skill_renamed',
        tables: [cacheOne, cacheTwo],
      });

      const payload: SkillRenamedEventPayload = {
        skill_id: skillId,
        name: 'Rust Lang',
        previous_name: 'Rust',
      };

      await db.transaction(async (tx) => {
        await subscriber.handler(renamedEvent(tenantId, payload), { tx } as never);
      });

      const [one] = await db.select().from(cacheOne).where(eq(cacheOne.skill_id, skillId));
      const [two] = await db.select().from(cacheTwo).where(eq(cacheTwo.skill_id, skillId));

      expect(one?.skill_name).toBe('Rust Lang');
      expect(two?.skill_name).toBe('Rust Lang');
    });
  });
});
