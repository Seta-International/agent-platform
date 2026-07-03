import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { runRetention } from '../../src/lifecycle.ts';

const env = {
  template: () => process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  base: () => process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('runRetention', () => {
  it('ttl deletes only rows past the horizon, in batches', async () => {
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async ({ pool }) => {
      await pool.query(`CREATE SCHEMA scratch`);
      await pool.query(
        `CREATE TABLE scratch.logs (id serial PRIMARY KEY, created_at timestamptz NOT NULL)`,
      );
      await pool.query(`INSERT INTO scratch.logs (created_at)
        SELECT now() - interval '100 days' FROM generate_series(1, 7)`);
      await pool.query(`INSERT INTO scratch.logs (created_at) VALUES (now())`);

      await runRetention(
        pool,
        [
          {
            table: 'scratch.logs',
            policy: { kind: 'ttl', column: 'created_at', olderThan: '90 days' },
          },
        ],
        { batchSize: 3 },
      );

      const left = await pool.query(`SELECT count(*)::int AS n FROM scratch.logs`);
      expect(left.rows[0].n).toBe(1);
    });
  });

  it('partition-drop detaches and drops only fully-expired RANGE children', async () => {
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async ({ pool }) => {
      await pool.query(`CREATE SCHEMA scratch`);
      await pool.query(`CREATE TABLE scratch.ev (occurred_at timestamptz NOT NULL)
        PARTITION BY RANGE (occurred_at)`);
      await pool.query(`CREATE TABLE scratch.ev_old PARTITION OF scratch.ev
        FOR VALUES FROM ('2020-01-01') TO ('2020-02-01')`);
      await pool.query(`CREATE TABLE scratch.ev_now PARTITION OF scratch.ev
        FOR VALUES FROM (now() - interval '5 days') TO (now() + interval '25 days')`);

      await runRetention(pool, [
        { table: 'scratch.ev', policy: { kind: 'partition-drop', olderThan: '365 days' } },
      ]);

      const kids = await pool.query<{ child: string }>(
        `SELECT c.relname AS child FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
          WHERE i.inhparent = 'scratch.ev'::regclass ORDER BY 1`,
      );
      expect(kids.rows.map((r) => r.child)).toEqual(['ev_now']);
    });
  });

  it('partition-drop never drops the DEFAULT partition', async () => {
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async ({ pool }) => {
      await pool.query(`CREATE SCHEMA scratch`);
      await pool.query(`CREATE TABLE scratch.ev (occurred_at timestamptz NOT NULL)
        PARTITION BY RANGE (occurred_at)`);
      await pool.query(`CREATE TABLE scratch.ev_old PARTITION OF scratch.ev
        FOR VALUES FROM ('2020-01-01') TO ('2020-02-01')`);
      await pool.query(`CREATE TABLE scratch.ev_now PARTITION OF scratch.ev
        FOR VALUES FROM (now() - interval '5 days') TO (now() + interval '25 days')`);
      await pool.query(`CREATE TABLE scratch.ev_def PARTITION OF scratch.ev DEFAULT`);

      await runRetention(pool, [
        { table: 'scratch.ev', policy: { kind: 'partition-drop', olderThan: '365 days' } },
      ]);

      const kids = await pool.query<{ child: string }>(
        `SELECT c.relname AS child FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
          WHERE i.inhparent = 'scratch.ev'::regclass ORDER BY 1`,
      );
      expect(kids.rows.map((r) => r.child)).toEqual(['ev_def', 'ev_now']);
    });
  });

  it('custom policies are invoked with the pool', async () => {
    await withTestDb({ templateDbName: env.template(), baseUrl: env.base() }, async ({ pool }) => {
      let ran = 0;
      await runRetention(pool, [
        {
          table: 'scratch.whatever',
          policy: {
            kind: 'custom',
            run: async () => {
              ran += 1;
            },
          },
        },
      ]);
      expect(ran).toBe(1);
    });
  });
});
