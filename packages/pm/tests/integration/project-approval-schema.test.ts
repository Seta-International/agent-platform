// packages/pm/tests/integration/project-approval-schema.test.ts
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { describe, expect, it } from 'vitest';
import { resetPmDb } from '../../src/backend/db/client.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('project_approval schema', () => {
  it('round-trips a project_approval row keyed on project_id', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const accountId = acc.rows[0].id;

        const proj = await pool.query(
          `INSERT INTO pm.project (tenant_id, account_id, name, status)
           VALUES ($1,$2,'P','submitted') RETURNING id`,
          [t.tenant_id, accountId],
        );
        const projectId = proj.rows[0].id;

        await pool.query(
          `INSERT INTO pm.project_approval (project_id, tenant_id, submitted_by_user_id)
           VALUES ($1,$2,$3)`,
          [projectId, t.tenant_id, t.admin_user_id],
        );

        const read = await pool.query(
          `SELECT project_id, tenant_id, submitted_by_user_id, version
             FROM pm.project_approval WHERE project_id = $1`,
          [projectId],
        );
        expect(read.rows).toHaveLength(1);
        expect(read.rows[0].project_id).toBe(projectId);
        expect(read.rows[0].tenant_id).toBe(t.tenant_id);
        expect(read.rows[0].submitted_by_user_id).toBe(t.admin_user_id);
        expect(read.rows[0].version).toBe(1);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });

  it('accepts project.status = submitted (previously rejected by the status check)', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const acc = await pool.query(
          `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
          [t.tenant_id],
        );
        const accountId = acc.rows[0].id;

        await expect(
          pool.query(
            `INSERT INTO pm.project (tenant_id, account_id, name, status)
             VALUES ($1,$2,'P','submitted')`,
            [t.tenant_id, accountId],
          ),
        ).resolves.toBeDefined();
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
