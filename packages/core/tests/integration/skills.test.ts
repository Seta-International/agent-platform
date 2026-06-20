import { describe, expect, it } from 'vitest';
import { createSkill, createSkillCategory, editSkill, listSkills } from '../../src/index.ts';
import { buildSkillAdminSession, withCoreTestDb } from '../helpers.ts';

async function seedTenant(pool: import('pg').Pool): Promise<string> {
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,$2,$3)`, [
    id,
    'T',
    `t-${id.slice(0, 8)}`,
  ]);
  return id;
}

describe('skills', () => {
  it('creates a skill under a category and lists it, filtered by category + active', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      const session = buildSkillAdminSession(tenant);
      const { id: catId } = await createSkillCategory({ input: { name: 'Frontend' }, session });
      const { id: otherCat } = await createSkillCategory({ input: { name: 'Data' }, session });

      const { id: skillId } = await createSkill({
        input: { category_id: catId, name: 'React' },
        session,
      });
      await createSkill({ input: { category_id: otherCat, name: 'PostgreSQL' }, session });

      const frontend = await listSkills(session, { categoryId: catId });
      expect(frontend.map((s) => s.name)).toEqual(['React']);

      await editSkill({ id: skillId, expected_version: 1, input: { name: 'ReactJS' }, session });
      const all = await listSkills(session, { activeOnly: true });
      expect(all.map((s) => s.name).sort()).toEqual(['PostgreSQL', 'ReactJS']);
    });
  });
});
