import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { peopleDb, resetPeopleDb } from '../../src/backend/db/client.ts';
import {
  accountProjection,
  person,
  projectProjection,
  workerAllocationProjection,
} from '../../src/backend/db/schema.ts';
import { getAllocationGrid } from '../../src/backend/domain/allocation-grid.ts';
import { seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

describe('0018 backfill projection sync (FUT-891)', () => {
  it('corrects missing, stale, and corrupted projection data from pm schema and verifies grid output', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPeopleDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const amPersonId = crypto.randomUUID();
        const devPersonId = crypto.randomUUID();
        const accountId = crypto.randomUUID();
        const project1Id = crypto.randomUUID();
        const project2Id = crypto.randomUUID();
        const alloc1Id = crypto.randomUUID();
        const alloc2Id = crypto.randomUUID();
        const allocDeletedId = crypto.randomUUID();

        // 1. Seed people.person
        await peopleDb()
          .insert(person)
          .values([
            {
              id: amPersonId,
              tenant_id: t.tenant_id,
              full_name: 'Hoàng Tuấn Nhật Minh',
              employee_no: '6394',
            },
            {
              id: devPersonId,
              tenant_id: t.tenant_id,
              full_name: 'Trần Văn Developer',
              employee_no: '7002',
            },
          ]);

        // 2. Seed authoritative data in pm schema
        await pool.query(
          `INSERT INTO pm.account (id, tenant_id, name, am_person_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())`,
          [accountId, t.tenant_id, 'Veritone', amPersonId],
        );

        await pool.query(
          `INSERT INTO pm.project (id, tenant_id, account_id, name, status, created_at, updated_at)
           VALUES
             ($1, $3, $4, 'VERI-AD', 'active', NOW(), NOW()),
             ($2, $3, $4, 'VERI-INTERNAL', 'active', NOW(), NOW())`,
          [project1Id, project2Id, t.tenant_id, accountId],
        );

        await pool.query(
          `INSERT INTO pm.allocation (id, tenant_id, project_id, person_id, role, planned_pct, bucket, status, date_from, date_to, version, created_at, updated_at, deleted_at)
           VALUES
             ($1, $4, $5, $7, 'Account Manager / Lead', 100, 'billable', 'committed', '2026-03-01', '2026-12-31', 1, NOW(), NOW(), NULL),
             ($2, $4, $6, $8, 'Developer', 50, 'internal', 'committed', '2026-01-01', '2026-06-30', 1, NOW(), NOW(), NULL),
             ($3, $4, $5, $8, 'Old Role', 50, 'billable', 'committed', '2026-01-01', '2026-03-31', 1, NOW(), NOW(), NOW())`,
          [
            alloc1Id,
            alloc2Id,
            allocDeletedId,
            t.tenant_id,
            project1Id,
            project2Id,
            amPersonId,
            devPersonId,
          ],
        );

        // 3. Intentionally populate corrupted / stale / mismatched projection data in people schema
        await peopleDb().insert(accountProjection).values({
          account_id: accountId,
          tenant_id: t.tenant_id,
          name: 'Wrong Old Account Name',
        });

        await peopleDb()
          .insert(projectProjection)
          .values([
            {
              project_id: project1Id,
              tenant_id: t.tenant_id,
              account_id: accountId,
              name: 'Wrong Old Project Name',
            },
            // Note: project2Id is intentionally MISSING in projectProjection
          ]);

        await peopleDb()
          .insert(workerAllocationProjection)
          .values([
            // alloc1Id is intentionally MISSING in workerAllocationProjection
            // alloc2Id has outdated dates and planned_pct
            {
              allocation_id: alloc2Id,
              tenant_id: t.tenant_id,
              person_id: devPersonId,
              project_id: project2Id,
              account_id: accountId,
              date_from: '2026-01-01',
              date_to: '2026-12-31',
              planned_pct: '100',
              bucket: 'billable',
              active: true,
            },
            // allocDeletedId was deleted in pm, but incorrectly active here
            {
              allocation_id: allocDeletedId,
              tenant_id: t.tenant_id,
              person_id: devPersonId,
              project_id: project1Id,
              account_id: accountId,
              date_from: '2026-01-01',
              date_to: '2026-03-31',
              planned_pct: '50',
              bucket: 'billable',
              active: true,
            },
          ]);

        // 4. Run the 0018 sync migration SQL
        const migrationPath = resolve(
          __dirname,
          '../../drizzle/migrations/0018_sync_project_account_projections.sql',
        );
        const sqlContent = readFileSync(migrationPath, 'utf8');
        await pool.query(sqlContent);

        // 5. Verify all projections in people schema are now 100% accurate
        const accRows = await peopleDb()
          .select()
          .from(accountProjection)
          .where(eq(accountProjection.account_id, accountId));
        expect(accRows[0]?.name).toBe('Veritone');

        const proj1Rows = await peopleDb()
          .select()
          .from(projectProjection)
          .where(eq(projectProjection.project_id, project1Id));
        expect(proj1Rows[0]?.name).toBe('VERI-AD');

        const proj2Rows = await peopleDb()
          .select()
          .from(projectProjection)
          .where(eq(projectProjection.project_id, project2Id));
        expect(proj2Rows[0]?.name).toBe('VERI-INTERNAL');

        const alloc1Rows = await peopleDb()
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, alloc1Id));
        expect(alloc1Rows).toHaveLength(1);
        expect(alloc1Rows[0]).toMatchObject({
          person_id: amPersonId,
          project_id: project1Id,
          account_id: accountId,
          date_from: '2026-03-01',
          date_to: '2026-12-31',
          planned_pct: '100.0000',
          bucket: 'billable',
          active: true,
        });

        const alloc2Rows = await peopleDb()
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, alloc2Id));
        expect(alloc2Rows[0]).toMatchObject({
          date_from: '2026-01-01',
          date_to: '2026-06-30',
          planned_pct: '50.0000',
          bucket: 'internal',
          active: true,
        });

        const allocDeletedRows = await peopleDb()
          .select()
          .from(workerAllocationProjection)
          .where(eq(workerAllocationProjection.allocation_id, allocDeletedId));
        expect(allocDeletedRows[0]?.active).toBe(false);

        // 6. Verify getAllocationGrid returns exact project names and months
        const grid = await getAllocationGrid(t.adminSession, { year: 2026 });
        const amRow = grid.rows.find((r) => r.worker_id === amPersonId);
        expect(amRow).toBeDefined();
        expect(amRow?.full_name).toBe('Hoàng Tuấn Nhật Minh');
        expect(amRow?.employee_no).toBe('6394');
        expect(amRow?.account_name).toBe('Veritone');
        expect(amRow?.project_name).toBe('VERI-AD'); // Correct project name, NOT 'Account management'!
        expect(amRow?.bucket).toBe('billable');
        // Mar - Dec: 100%, Jan - Feb: null
        expect(amRow?.months).toEqual([
          null,
          null,
          100,
          100,
          100,
          100,
          100,
          100,
          100,
          100,
          100,
          100,
        ]);
        expect(amRow?.total_mm).toBe(10);

        const devRow = grid.rows.find((r) => r.worker_id === devPersonId);
        expect(devRow).toBeDefined();
        expect(devRow?.project_name).toBe('VERI-INTERNAL');
        expect(devRow?.bucket).toBe('internal');
        expect(devRow?.months).toEqual([
          50,
          50,
          50,
          50,
          50,
          50,
          null,
          null,
          null,
          null,
          null,
          null,
        ]);
        expect(devRow?.total_mm).toBe(3);
      } finally {
        resetPeopleDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
