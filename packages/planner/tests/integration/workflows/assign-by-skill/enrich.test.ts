import { CopilotRegistry } from '@seta/copilot-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { assignTask, createGroup, createPlan, createTask } from '@seta/planner';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plannerGetOpenTaskCountSpec } from '../../../../src/backend/agent-tools/get-open-task-count.ts';
import { enrichWithLoadAndCapacity } from '../../../../src/backend/workflows/assign-by-skill/steps/enrich-with-load-capacity.ts';
import { withCopilotTestDb } from '../../agent-tools-helpers.ts';

function adminSession(opts: { tenant_id: string; user_id: string; email: string }): SessionScope {
  const role_summary = { roles: ['org.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email,
    display_name: 'Admin',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    accessible_group_ids: [],
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

async function seedProjection(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  tenant_id: string,
  user_id: string,
  display_name: string,
  email: string,
  opts: { timezone?: string } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.assignee_projection
     (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
     VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', $5)
     ON CONFLICT (user_id) DO NOTHING`,
    [user_id, tenant_id, display_name, email, opts.timezone ?? 'UTC'],
  );
}

describe('enrichWithLoadAndCapacity', () => {
  beforeEach(() => {
    CopilotRegistry.__resetForTests();
  });
  afterEach(() => {
    CopilotRegistry.__resetForTests();
  });

  it('fills openTaskCount from registered planner read tool; capacity null when timesheet missing', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = adminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@d.local',
      });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'admin@d.local');

      const assignee = await createUser(
        { tenant_id, email: 'a@d.local', name: 'A', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, tenant_id, assignee.user_id, 'A', 'a@d.local');

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      for (let i = 0; i < 2; i++) {
        const t = await createTask({ plan_id: plan.id, title: `t${i}`, session });
        await assignTask({ task_id: t.id, user_id: assignee.user_id, session });
      }

      CopilotRegistry.registerCrossModuleReadTool(plannerGetOpenTaskCountSpec);
      CopilotRegistry.freeze();

      const out = await enrichWithLoadAndCapacity({
        tenantId: tenant_id,
        callerUserId: admin_user_id,
        callerRoleSummary: { roles: ['org.admin'], cross_tenant_read: false },
        candidates: [
          {
            userId: assignee.user_id,
            displayName: 'A',
            skills: [],
            exactOverlap: 0,
            vectorScore: null,
            historyScore: null,
            historyMatches: 0,
          },
        ],
      });

      expect(out[0]!.openTaskCount).toBe(2);
      expect(out[0]!.hoursAvailableThisWeek).toBeNull();
    });
  });

  it('all signals null when no read tools registered (full degradation)', async () => {
    await withCopilotTestDb(async ({ pool: _pool }) => {
      CopilotRegistry.freeze();
      const out = await enrichWithLoadAndCapacity({
        tenantId: crypto.randomUUID(),
        callerUserId: crypto.randomUUID(),
        callerRoleSummary: { roles: [], cross_tenant_read: false },
        candidates: [
          {
            userId: crypto.randomUUID(),
            displayName: 'X',
            skills: [],
            exactOverlap: 0,
            vectorScore: null,
            historyScore: null,
            historyMatches: 0,
          },
        ],
      });
      expect(out[0]!.openTaskCount).toBeNull();
      expect(out[0]!.hoursAvailableThisWeek).toBeNull();
      expect(out[0]!.timezone).toBeNull();
    });
  });
});
