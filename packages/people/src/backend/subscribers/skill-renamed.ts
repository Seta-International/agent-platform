import { makeSkillRenamedSubscriber } from '@seta/core';
import { personSkill } from '../db/schema.ts';

export const personSkillRenamed = makeSkillRenamedSubscriber({
  subscription: 'people.person_skill.skill_renamed',
  tables: [personSkill],
});
