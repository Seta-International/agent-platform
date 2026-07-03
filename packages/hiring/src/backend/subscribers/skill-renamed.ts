import { CORE_SKILL_RENAMED, type SkillRenamedEventPayload } from '@seta/core';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { candidateSkill, requisitionSkill } from '../db/schema.ts';

export const hiringSkillRenamed: SubscriberDef = {
  subscription: 'hiring.skill.skill_renamed',
  event: CORE_SKILL_RENAMED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<SkillRenamedEventPayload>;
    const { skill_id, name } = e.payload;

    await ctx.tx
      .update(candidateSkill)
      .set({ skill_name: name, updated_at: new Date() })
      .where(and(eq(candidateSkill.tenant_id, e.tenantId), eq(candidateSkill.skill_id, skill_id)));

    await ctx.tx
      .update(requisitionSkill)
      .set({ skill_name: name, updated_at: new Date() })
      .where(
        and(eq(requisitionSkill.tenant_id, e.tenantId), eq(requisitionSkill.skill_id, skill_id)),
      );
  },
};
