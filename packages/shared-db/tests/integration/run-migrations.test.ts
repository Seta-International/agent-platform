import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withTestDb } from '@seta/shared-testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../../src/migrate.ts';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'migrate-'));
});
afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writeMigration(dir: string, name: string, body: string): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, name);
  writeFileSync(p, body);
  return p;
}

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE,
  base: () => process.env.PLATFORM_TEST_PG_BASE,
};

describe('runMigrations', () => {
  it('applies a single hand-written SQL file and records it in the ledger', async () => {
    const dir = join(tmpRoot, 'mod-a');
    writeMigration(
      dir,
      '0001_create_thing.sql',
      `CREATE SCHEMA IF NOT EXISTS mod_a; CREATE TABLE mod_a.thing (id int);`,
    );

    await withTestDb(
      { templateDbName: env.template() as string, baseUrl: env.base() as string },
      async ({ pool }) => {
        await runMigrations({ pool, modules: [{ name: 'mod_a', dir }] });
        const { rows } = await pool.query(
          `SELECT module, filename FROM core.__platform_migrations ORDER BY filename`,
        );
        expect(rows).toEqual([{ module: 'mod_a', filename: '0001_create_thing.sql' }]);
        const tbl = await pool.query(`SELECT to_regclass('mod_a.thing') AS reg`);
        expect(tbl.rows[0]?.reg).toBe('mod_a.thing');
      },
    );
  });

  it('is idempotent — second call skips already-applied migrations', async () => {
    const dir = join(tmpRoot, 'mod-a');
    writeMigration(
      dir,
      '0001_create_thing.sql',
      `CREATE SCHEMA IF NOT EXISTS mod_a; CREATE TABLE mod_a.thing (id int);`,
    );

    await withTestDb(
      { templateDbName: env.template() as string, baseUrl: env.base() as string },
      async ({ pool }) => {
        await runMigrations({ pool, modules: [{ name: 'mod_a', dir }] });
        await runMigrations({ pool, modules: [{ name: 'mod_a', dir }] });
        const { rows } = await pool.query(
          `SELECT count(*)::int AS n FROM core.__platform_migrations WHERE filename='0001_create_thing.sql'`,
        );
        expect(rows[0]?.n).toBe(1);
      },
    );
  });

  it('throws MigrationChecksumMismatch when a previously-applied file has changed', async () => {
    const dir = join(tmpRoot, 'mod-a');
    const p = writeMigration(
      dir,
      '0001_create_thing.sql',
      `CREATE SCHEMA IF NOT EXISTS mod_a; CREATE TABLE mod_a.thing (id int);`,
    );

    await withTestDb(
      { templateDbName: env.template() as string, baseUrl: env.base() as string },
      async ({ pool }) => {
        await runMigrations({ pool, modules: [{ name: 'mod_a', dir }] });
        writeFileSync(p, `CREATE SCHEMA IF NOT EXISTS mod_a; CREATE TABLE mod_a.other (id int);`);
        await expect(runMigrations({ pool, modules: [{ name: 'mod_a', dir }] })).rejects.toThrow(
          /checksum mismatch/i,
        );
      },
    );
  });

  it('runs multi-module migrations in input order, lexical filename order within each', async () => {
    const dirA = join(tmpRoot, 'mod-a');
    const dirB = join(tmpRoot, 'mod-b');
    writeMigration(
      dirA,
      '0001_a_one.sql',
      `CREATE SCHEMA IF NOT EXISTS mod_a; CREATE TABLE mod_a.a1 (x int);`,
    );
    writeMigration(dirA, '0002_a_two.sql', `CREATE TABLE mod_a.a2 (x int);`);
    writeMigration(
      dirB,
      '0001_b_one.sql',
      `CREATE SCHEMA IF NOT EXISTS mod_b; CREATE TABLE mod_b.b1 (x int);`,
    );

    await withTestDb(
      { templateDbName: env.template() as string, baseUrl: env.base() as string },
      async ({ pool }) => {
        await runMigrations({
          pool,
          modules: [
            { name: 'mod_a', dir: dirA },
            { name: 'mod_b', dir: dirB },
          ],
        });
        const { rows } = await pool.query(
          `SELECT module, filename FROM core.__platform_migrations ORDER BY applied_at, filename`,
        );
        expect(rows.map((r) => `${r.module}/${r.filename}`)).toEqual([
          'mod_a/0001_a_one.sql',
          'mod_a/0002_a_two.sql',
          'mod_b/0001_b_one.sql',
        ]);
      },
    );
  });
});
