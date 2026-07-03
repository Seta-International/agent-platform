import { CORE_SKILL_RENAMED, type SkillRenamedEventPayload } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import { person, personSkill } from '../../src/backend/db/schema.ts';
import { personSkillRenamed } from '../../src/backend/subscribers/skill-renamed.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

function renamedEvent(
  tenantId: string,
  payload: SkillRenamedEventPayload,
): DomainEvent<SkillRenamedEventPayload> {
  return {
    id: crypto.randomUUID(),
    tenantId,
    aggregateType: 'core.skill',
    aggregateId: payload.skill_id,
    eventType: CORE_SKILL_RENAMED,
    eventVersion: 1,
    payload,
  } as never;
}

describe('personSkillRenamed', () => {
  it('refreshes skill_name cache on person_skill and is idempotent on replay', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const [p] = await peopleDb().insert(person).values({ tenant_id: t.tenant_id }).returning();
        const personId = p!.id;
        const skillId = crypto.randomUUID();

        await peopleDb().insert(personSkill).values({
          tenant_id: t.tenant_id,
          person_id: personId,
          skill_id: skillId,
          skill_name: 'TypeScript',
        });

        const payload: SkillRenamedEventPayload = {
          skill_id: skillId,
          name: 'TS',
          previous_name: 'TypeScript',
        };

        await peopleDb().transaction(async (tx) => {
          await personSkillRenamed.handler(renamedEvent(t.tenant_id, payload), { tx } as never);
        });

        let rows = await peopleDb()
          .select()
          .from(personSkill)
          .where(eq(personSkill.skill_id, skillId));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.skill_name).toBe('TS');

        // Replay the same event — naturally idempotent, no change in outcome.
        await peopleDb().transaction(async (tx) => {
          await personSkillRenamed.handler(renamedEvent(t.tenant_id, payload), { tx } as never);
        });

        rows = await peopleDb().select().from(personSkill).where(eq(personSkill.skill_id, skillId));
        expect(rows).toHaveLength(1);
        expect(rows[0]!.skill_name).toBe('TS');
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
