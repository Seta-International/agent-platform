import { makeSkillRenamedSubscriber } from '@seta/core';
import { staffingPlanLineSkill } from '../db/schema.ts';

export const staffingPlanLineSkillRenamed = makeSkillRenamedSubscriber({
  subscription: 'pm.staffing_plan_line_skill.skill_renamed',
  tables: [staffingPlanLineSkill],
});
