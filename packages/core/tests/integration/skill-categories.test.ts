import { describe, expect, it } from 'vitest';
import {
  archiveSkillCategory,
  CoreSkillError,
  createSkillCategory,
  editSkillCategory,
  listSkillCategories,
} from '../../src/index.ts';
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

describe('skill categories', () => {
  it('creates, edits, archives, and lists categories', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      const session = buildSkillAdminSession(tenant);

      const { id } = await createSkillCategory({ input: { name: 'Frontend' }, session });
      let list = await listSkillCategories(session);
      expect(list.map((c) => c.name)).toEqual(['Frontend']);

      const { version } = await editSkillCategory({
        id,
        expected_version: 1,
        input: { name: 'Front End', sort_order: 5 },
        session,
      });
      expect(version).toBe(2);

      await archiveSkillCategory({ id, expected_version: 2, session });
      list = await listSkillCategories(session, { activeOnly: true });
      expect(list).toEqual([]);
    });
  });

  it('rejects a stale version with CONFLICT', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      const session = buildSkillAdminSession(tenant);
      const { id } = await createSkillCategory({ input: { name: 'Data' }, session });
      await expect(
        editSkillCategory({ id, expected_version: 99, input: { name: 'X' }, session }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  it('forbids a session without manage', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = await seedTenant(pool);
      const reader = buildSkillAdminSession(tenant, []);
      await expect(
        createSkillCategory({ input: { name: 'Nope' }, session: reader }),
      ).rejects.toBeInstanceOf(CoreSkillError);
    });
  });
});
