import { CORE_SKILL_RENAMED, type SkillRenamedEventPayload } from '@seta/core';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import type { DomainEvent } from '@seta/shared-types';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { hiringDb, resetHiringDb } from '../../src/backend/db/client.ts';
import {
  candidate,
  candidateSkill,
  requisition,
  requisitionSkill,
} from '../../src/backend/db/schema.ts';
import { hiringSkillRenamed } from '../../src/backend/subscribers/skill-renamed.ts';
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

describe('hiringSkillRenamed', () => {
  it('refreshes skill_name cache on candidate_skill AND requisition_skill, idempotent on replay', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const [cand] = await hiringDb()
          .insert(candidate)
          .values({ tenant_id: t.tenant_id, name: 'Jane Doe' })
          .returning();
        const [req] = await hiringDb()
          .insert(requisition)
          .values({ tenant_id: t.tenant_id, title: 'Backend Engineer' })
          .returning();
        const skillId = crypto.randomUUID();

        await hiringDb().insert(candidateSkill).values({
          tenant_id: t.tenant_id,
          candidate_id: cand!.id,
          skill_id: skillId,
          skill_name: 'TypeScript',
        });
        await hiringDb().insert(requisitionSkill).values({
          tenant_id: t.tenant_id,
          requisition_id: req!.id,
          skill_id: skillId,
          skill_name: 'TypeScript',
        });

        const payload: SkillRenamedEventPayload = {
          skill_id: skillId,
          name: 'TS',
          previous_name: 'TypeScript',
        };

        await hiringDb().transaction(async (tx) => {
          await hiringSkillRenamed.handler(renamedEvent(t.tenant_id, payload), { tx } as never);
        });

        let candRows = await hiringDb()
          .select()
          .from(candidateSkill)
          .where(eq(candidateSkill.skill_id, skillId));
        let reqRows = await hiringDb()
          .select()
          .from(requisitionSkill)
          .where(eq(requisitionSkill.skill_id, skillId));
        expect(candRows).toHaveLength(1);
        expect(reqRows).toHaveLength(1);
        expect(candRows[0]!.skill_name).toBe('TS');
        expect(reqRows[0]!.skill_name).toBe('TS');

        // Replay the same event — naturally idempotent, no change in outcome.
        await hiringDb().transaction(async (tx) => {
          await hiringSkillRenamed.handler(renamedEvent(t.tenant_id, payload), { tx } as never);
        });

        candRows = await hiringDb()
          .select()
          .from(candidateSkill)
          .where(eq(candidateSkill.skill_id, skillId));
        reqRows = await hiringDb()
          .select()
          .from(requisitionSkill)
          .where(eq(requisitionSkill.skill_id, skillId));
        expect(candRows).toHaveLength(1);
        expect(reqRows).toHaveLength(1);
        expect(candRows[0]!.skill_name).toBe('TS');
        expect(reqRows[0]!.skill_name).toBe('TS');
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
