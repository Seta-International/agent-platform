import { makeSkillRenamedSubscriber } from '@seta/core';
import { candidateSkill, requisitionSkill } from '../db/schema.ts';

export const hiringSkillRenamed = makeSkillRenamedSubscriber({
  subscription: 'hiring.skill.skill_renamed',
  tables: [candidateSkill, requisitionSkill],
});
