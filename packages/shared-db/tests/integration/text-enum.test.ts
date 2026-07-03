import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { textEnumValuesSql } from '../../src/text-enum.ts';

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  base: () => process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('textEnum CHECK semantics', () => {
  it('the emitted IN-list rejects values outside the enum', async () => {
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async ({ pool }) => {
      await pool.query(`
        CREATE TABLE scratch_enum (
          status text NOT NULL,
          CONSTRAINT scratch_enum_status_check CHECK (status IN (${textEnumValuesSql(['open', 'closed'])}))
        )`);
      await pool.query(`INSERT INTO scratch_enum (status) VALUES ('open')`);
      await expect(
        pool.query(`INSERT INTO scratch_enum (status) VALUES ('bogus')`),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});
