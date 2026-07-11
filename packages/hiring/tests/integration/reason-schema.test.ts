import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetHiringDb } from '../../src/backend/db/client.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('hiring.reason schema', () => {
  it('round-trips opening_close (category null) and rejection (category set) rows', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const ins = `INSERT INTO hiring.reason (tenant_id, kind, label, category)
          VALUES ($1,$2,$3,$4) RETURNING id, kind, label, category`;

        const closeRow = await pool.query(ins, [t.tenant_id, 'opening_close', 'Budget cut', null]);
        expect(closeRow.rows[0]).toMatchObject({
          kind: 'opening_close',
          label: 'Budget cut',
          category: null,
        });

        const rejectRow = await pool.query(ins, [
          t.tenant_id,
          'rejection',
          'Failed screen',
          'rejected_by_us',
        ]);
        expect(rejectRow.rows[0]).toMatchObject({
          kind: 'rejection',
          label: 'Failed screen',
          category: 'rejected_by_us',
        });
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects a rejection row with no category (reason_category_required_for_rejection)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await expect(
          pool.query(
            `INSERT INTO hiring.reason (tenant_id, kind, label, category) VALUES ($1,$2,$3,$4)`,
            [t.tenant_id, 'rejection', 'x', null],
          ),
        ).rejects.toThrow();
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('enforces per-(tenant, kind) label uniqueness but allows the same label across kinds', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const ins = `INSERT INTO hiring.reason (tenant_id, kind, label, category) VALUES ($1,$2,$3,$4)`;
        await pool.query(ins, [t.tenant_id, 'opening_close', 'Other', null]);

        await expect(
          pool.query(ins, [t.tenant_id, 'opening_close', 'Other', null]),
        ).rejects.toThrow();

        await expect(
          pool.query(ins, [t.tenant_id, 'rejection', 'Other', 'other']),
        ).resolves.toBeTruthy();
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('rejects an invalid category value under kind=rejection', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetHiringDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        await expect(
          pool.query(
            `INSERT INTO hiring.reason (tenant_id, kind, label, category) VALUES ($1,$2,$3,$4)`,
            [t.tenant_id, 'rejection', 'y', 'not_a_real_category'],
          ),
        ).rejects.toThrow();
      } finally {
        resetHiringDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
