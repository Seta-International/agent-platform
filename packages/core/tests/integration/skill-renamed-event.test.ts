import { scoped } from '@seta/shared-db';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { coreEvents } from '../../src/db/schema/index.ts';
import { createSkill, createSkillCategory, editSkill } from '../../src/index.ts';
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

describe('core.skill.renamed', () => {
  it('renaming a skill emits exactly one core.skill.renamed with old and new name', async () => {
    await withCoreTestDb(async ({ pool, db }) => {
      const tenantId = await seedTenant(pool);
      const skillId = await scoped(tenantId, async () => {
        const session = buildSkillAdminSession(tenantId);
        const { id: catId } = await createSkillCategory({ input: { name: 'Languages' }, session });
        const { id: skillId } = await createSkill({
          input: { category_id: catId, name: 'TypeScript' },
          session,
        });

        await editSkill({
          id: skillId,
          expected_version: 1,
          input: { name: 'TS' },
          session,
        });
        return skillId;
      });

      const rows = await db
        .select()
        .from(coreEvents)
        .where(
          and(eq(coreEvents.tenantId, tenantId), eq(coreEvents.eventType, 'core.skill.renamed')),
        );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.payload).toEqual({
        skill_id: skillId,
        name: 'TS',
        previous_name: 'TypeScript',
      });
    });
  });

  it('a non-name edit (category change) emits zero core.skill.renamed events', async () => {
    await withCoreTestDb(async ({ pool, db }) => {
      const tenantId = await seedTenant(pool);
      await scoped(tenantId, async () => {
        const session = buildSkillAdminSession(tenantId);
        const { id: catId } = await createSkillCategory({ input: { name: 'Languages' }, session });
        const { id: otherCatId } = await createSkillCategory({
          input: { name: 'Frameworks' },
          session,
        });
        const { id: skillId } = await createSkill({
          input: { category_id: catId, name: 'TypeScript' },
          session,
        });

        await editSkill({
          id: skillId,
          expected_version: 1,
          input: { category_id: otherCatId },
          session,
        });
      });

      const rows = await db
        .select()
        .from(coreEvents)
        .where(
          and(eq(coreEvents.tenantId, tenantId), eq(coreEvents.eventType, 'core.skill.renamed')),
        );

      expect(rows).toHaveLength(0);
    });
  });

  it('editing with the same (trimmed) name emits zero core.skill.renamed events', async () => {
    await withCoreTestDb(async ({ pool, db }) => {
      const tenantId = await seedTenant(pool);
      await scoped(tenantId, async () => {
        const session = buildSkillAdminSession(tenantId);
        const { id: catId } = await createSkillCategory({ input: { name: 'Languages' }, session });
        const { id: skillId } = await createSkill({
          input: { category_id: catId, name: 'TypeScript' },
          session,
        });

        await editSkill({
          id: skillId,
          expected_version: 1,
          input: { name: '  TypeScript  ' },
          session,
        });
      });

      const rows = await db
        .select()
        .from(coreEvents)
        .where(
          and(eq(coreEvents.tenantId, tenantId), eq(coreEvents.eventType, 'core.skill.renamed')),
        );

      expect(rows).toHaveLength(0);
    });
  });
});
