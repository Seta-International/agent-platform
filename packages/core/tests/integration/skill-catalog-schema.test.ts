import { describe, expect, it } from 'vitest';
import { withCoreTestDb } from '../helpers.ts';

describe('skill catalog schema', () => {
  it('stores a category and a skill referencing it, with uniqueness per tenant', async () => {
    await withCoreTestDb(async ({ pool }) => {
      const tenant = crypto.randomUUID();
      await pool.query(`INSERT INTO core.tenants (id, name, slug) VALUES ($1,$2,$3)`, [
        tenant,
        'T',
        `t-${tenant.slice(0, 8)}`,
      ]);
      const cat = crypto.randomUUID();
      await pool.query(`INSERT INTO core.skill_category (id, tenant_id, name) VALUES ($1,$2,$3)`, [
        cat,
        tenant,
        'Frontend',
      ]);
      await pool.query(
        `INSERT INTO core.skill (id, tenant_id, category_id, name, slug) VALUES ($1,$2,$3,$4,$5)`,
        [crypto.randomUUID(), tenant, cat, 'React', 'react'],
      );

      const { rows } = await pool.query(
        `SELECT s.name AS skill, c.name AS category
           FROM core.skill s JOIN core.skill_category c ON c.id = s.category_id
          WHERE s.tenant_id = $1`,
        [tenant],
      );
      expect(rows).toEqual([{ skill: 'React', category: 'Frontend' }]);

      await expect(
        pool.query(
          `INSERT INTO core.skill (id, tenant_id, category_id, name, slug) VALUES ($1,$2,$3,$4,$5)`,
          [crypto.randomUUID(), tenant, cat, 'React', 'react'],
        ),
      ).rejects.toThrow(/duplicate key/);
    });
  });
});
