import { resetCoreDb } from '@seta/core/testing';
import { closePools, initPools } from '@seta/shared-db';
import { withTestDb } from '@seta/shared-testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { pmDb, resetPmDb } from '../../src/backend/db/client.ts';
import { staffingPlanLineSkill } from '../../src/backend/db/schema.ts';
import {
  deleteStaffingPlanLine,
  listStaffingPlan,
  submitCharter,
  upsertStaffingPlanLine,
} from '../../src/index.ts';
import { approveCharterTwoStage, seedTenant } from '../helpers.ts';

const ctx = {
  templateDbName: process.env.PLATFORM_TEST_PG_TEMPLATE as string,
  baseUrl: process.env.PLATFORM_TEST_PG_BASE as string,
};

async function seedProject(
  pool: import('pg').Pool,
  session: import('@seta/core').SessionScope,
  tenantId: string,
) {
  const acc = await pool.query(
    `INSERT INTO pm.account (tenant_id, name) VALUES ($1,'A') RETURNING id`,
    [tenantId],
  );
  const { charter_id } = await submitCharter({
    account_id: acc.rows[0].id,
    name: 'P',
    pm_worker_id: session.user_id,
    methodology: 'scrum',
    pricing_model: 'fixed_price',
    budget_bmm: 100,
    session,
  });
  return approveCharterTwoStage(charter_id, tenantId);
}

describe('staffing_plan_line_skill child table', () => {
  it('follows update (2 -> 1) and cascade-deletes with the line', async () => {
    await withTestDb(ctx, async ({ pool, databaseUrl }) => {
      resetCoreDb();
      resetPmDb();
      initPools({ databaseUrl });
      try {
        const t = await seedTenant(pool);
        const { project_id } = await seedProject(pool, t.adminSession, t.tenant_id);

        const nodeSkillId = crypto.randomUUID();
        const tsSkillId = crypto.randomUUID();

        const line = await upsertStaffingPlanLine({
          project_id,
          role: 'Backend',
          effort_mm: 2,
          skills: [
            { skill_id: nodeSkillId, skill_name: 'Node.js', min_level: 3 },
            { skill_id: tsSkillId, skill_name: 'TypeScript' },
          ],
          session: t.adminSession,
        });

        let childRows = await pmDb()
          .select()
          .from(staffingPlanLineSkill)
          .where(eq(staffingPlanLineSkill.line_id, line.line_id));
        expect(childRows).toHaveLength(2);

        const [listed] = await listStaffingPlan({ project_id, session: t.adminSession });
        expect(listed?.skills).toEqual(
          expect.arrayContaining([
            { skill_id: nodeSkillId, skill_name: 'Node.js', min_level: 3 },
            { skill_id: tsSkillId, skill_name: 'TypeScript', min_level: null },
          ]),
        );

        // Update to a single skill: child rows follow (2 -> 1).
        await upsertStaffingPlanLine({
          project_id,
          line_id: line.line_id,
          expected_version: line.version,
          role: 'Backend',
          effort_mm: 2,
          skills: [{ skill_id: nodeSkillId, skill_name: 'Node.js', min_level: 4 }],
          session: t.adminSession,
        });

        childRows = await pmDb()
          .select()
          .from(staffingPlanLineSkill)
          .where(eq(staffingPlanLineSkill.line_id, line.line_id));
        expect(childRows).toHaveLength(1);
        expect(childRows[0]?.skill_id).toBe(nodeSkillId);
        expect(childRows[0]?.min_level).toBe(4);

        // Deleting the line cascades to its remaining skill child row.
        const { deleted } = await deleteStaffingPlanLine({
          project_id,
          line_id: line.line_id,
          session: t.adminSession,
        });
        expect(deleted).toBe(true);

        childRows = await pmDb()
          .select()
          .from(staffingPlanLineSkill)
          .where(eq(staffingPlanLineSkill.line_id, line.line_id));
        expect(childRows).toHaveLength(0);
      } finally {
        resetPmDb();
        resetCoreDb();
        await closePools();
      }
    });
  });
});
