import type { SessionScope } from '@seta/core';
import {
  createSkill,
  createSkillAlias,
  createSkillCategory,
  listSkillCategories,
  listSkills,
} from '@seta/core';
import pino from 'pino';
import { SKILL_ALIASES, SKILL_CATALOG } from './skill-catalog.ts';

const log = pino({ name: 'cli/seed-fixture/skills' });

export interface SeededSkill {
  id: string;
  name: string;
}

export async function seedSkillCatalog(session: SessionScope): Promise<Map<string, SeededSkill>> {
  const byName = new Map<string, SeededSkill>();

  const existingCats = await listSkillCategories(session);
  const catIdByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c.id]));

  const existingSkills = await listSkills(session);
  for (const s of existingSkills) byName.set(s.name.toLowerCase(), { id: s.id, name: s.name });

  let catsCreated = 0;
  let skillsCreated = 0;

  for (const [i, cat] of SKILL_CATALOG.entries()) {
    let catId = catIdByName.get(cat.name.toLowerCase());
    if (!catId) {
      catId = (await createSkillCategory({ input: { name: cat.name, sort_order: i }, session })).id;
      catIdByName.set(cat.name.toLowerCase(), catId);
      catsCreated++;
    }
    for (const skillName of cat.skills) {
      if (byName.has(skillName.toLowerCase())) continue;
      const { id } = await createSkill({ input: { category_id: catId, name: skillName }, session });
      byName.set(skillName.toLowerCase(), { id, name: skillName });
      skillsCreated++;
    }
  }

  let aliasesCreated = 0;
  for (const [canonical, variants] of Object.entries(SKILL_ALIASES)) {
    const skill = byName.get(canonical.toLowerCase());
    if (!skill) continue;
    for (const alias of variants) {
      await createSkillAlias({ input: { skill_id: skill.id, alias }, session });
      aliasesCreated++;
    }
  }

  log.info(
    {
      categories_created: catsCreated,
      skills_created: skillsCreated,
      aliases_created: aliasesCreated,
      total: byName.size,
    },
    'phase-skills done',
  );
  return byName;
}
