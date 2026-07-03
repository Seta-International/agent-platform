import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { buildTouchTriggerSql, buildTouchUpdatedAtFnSql } from '../../src/touch-updated-at.ts';

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  base: () => process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('touch updated_at trigger', () => {
  it('bumps updated_at on UPDATE without app involvement', async () => {
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async ({ pool }) => {
      await pool.query(`CREATE SCHEMA scratch`);
      await pool.query(`CREATE TABLE scratch.things (
        id int PRIMARY KEY, label text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
      await pool.query(buildTouchUpdatedAtFnSql('scratch'));
      await pool.query(buildTouchTriggerSql('scratch', 'things'));

      await pool.query(`INSERT INTO scratch.things (id, label) VALUES (1, 'a')`);
      const before = await pool.query(`SELECT updated_at FROM scratch.things WHERE id = 1`);
      await pool.query(`SELECT pg_sleep(0.05)`);
      await pool.query(`UPDATE scratch.things SET label = 'b' WHERE id = 1`);
      const after = await pool.query(`SELECT updated_at FROM scratch.things WHERE id = 1`);
      expect(new Date(after.rows[0].updated_at).getTime()).toBeGreaterThan(
        new Date(before.rows[0].updated_at).getTime(),
      );
    });
  });
});
