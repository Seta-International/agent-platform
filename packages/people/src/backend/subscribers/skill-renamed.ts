import { CORE_SKILL_RENAMED, type SkillRenamedEventPayload } from '@seta/core';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { personSkill } from '../db/schema.ts';

export const personSkillRenamed: SubscriberDef = {
  subscription: 'people.person_skill.skill_renamed',
  event: CORE_SKILL_RENAMED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<SkillRenamedEventPayload>;
    const { skill_id, name } = e.payload;

    await ctx.tx
      .update(personSkill)
      .set({ skill_name: name, updated_at: new Date() })
      .where(and(eq(personSkill.tenant_id, e.tenantId), eq(personSkill.skill_id, skill_id)));
  },
};
