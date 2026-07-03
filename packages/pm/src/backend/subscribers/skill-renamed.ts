import { CORE_SKILL_RENAMED, type SkillRenamedEventPayload } from '@seta/core';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { and, eq } from 'drizzle-orm';
import { staffingPlanLineSkill } from '../db/schema.ts';

export const staffingPlanLineSkillRenamed: SubscriberDef = {
  subscription: 'pm.staffing_plan_line_skill.skill_renamed',
  event: CORE_SKILL_RENAMED,
  eventVersion: 1,
  handler: async (event, ctx) => {
    const e = event as DomainEvent<SkillRenamedEventPayload>;
    const { skill_id, name } = e.payload;

    await ctx.tx
      .update(staffingPlanLineSkill)
      .set({ skill_name: name, updated_at: new Date() })
      .where(
        and(
          eq(staffingPlanLineSkill.tenant_id, e.tenantId),
          eq(staffingPlanLineSkill.skill_id, skill_id),
        ),
      );
  },
};
