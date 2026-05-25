import { randomUUID } from 'node:crypto';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { assignTask, createGroup, createPlan, createTask } from '@seta/planner';
import type { EmbeddingProvider } from '@seta/shared-embeddings';
import { describe, expect, it } from 'vitest';
import { plannerSuggestAssigneeTool } from '../../../src/backend/agent-tools/suggest-assignee.ts';
import type { AssignBySkillOutput } from '../../../src/backend/workflows/assign-by-skill/schemas.ts';
import { makeToolContext, withCopilotTestDb } from '../agent-tools-helpers.ts';

function buildAdminSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
}): SessionScope {
  const role_summary = { roles: ['org.admin'], cross_tenant_read: false };
  return {
    session_id: randomUUID(),
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
  args: { tenant_id: string; user_id: string; email: string; name: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.assignee_projection
     (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
     VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC')
     ON CONFLICT (user_id) DO NOTHING`,
    [args.user_id, args.tenant_id, args.name, args.email],
  );
}

const fakeProvider: EmbeddingProvider = {
  modelId: 'fake',
  dimensions: 1536,
  embed: async () => {
    throw new Error('embed must not be called on the supersede-guard resume path');
  },
};

describe('planner_suggestAssignee — supersede guard on resume (INV-1)', () => {
  it('returns kind=superseded when the task was assigned between suspend and resume', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const adminSession = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      await seedProjection(pool, {
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
        name: 'Admin',
      });

      const winner = await createUser(
        { tenant_id, email: 'winner@demo.local', name: 'Winner', password: 'test-password' },
        { type: 'user', user_id: admin_user_id },
      );
      const loser = await createUser(
        { tenant_id, email: 'loser@demo.local', name: 'Loser', password: 'test-password' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, {
        tenant_id,
        user_id: winner.user_id,
        email: 'winner@demo.local',
        name: 'Winner',
      });
      await seedProjection(pool, {
        tenant_id,
        user_id: loser.user_id,
        email: 'loser@demo.local',
        name: 'Loser',
      });

      const group = await createGroup({ tenant_id, name: 'G', session: adminSession });
      const plan = await createPlan({ group_id: group.id, name: 'P', session: adminSession });
      const task = await createTask({
        plan_id: plan.id,
        title: 'race target',
        session: adminSession,
      });

      // Simulate the race: the workflow inbox assigned `winner` to the task
      // between the chat's suspend and the chat's resume.
      await assignTask({
        task_id: task.id,
        user_id: winner.user_id,
        session: adminSession,
      });

      const tool = plannerSuggestAssigneeTool({ provider: fakeProvider, databaseUrl });
      const ctx = makeToolContext({ user_id: admin_user_id }) as ReturnType<
        typeof makeToolContext
      > & {
        agent: { resumeData: { action: 'assign'; assigneeUserId: string } };
      };
      ctx.agent = {
        resumeData: { action: 'assign', assigneeUserId: loser.user_id },
      };

      const result = (await tool.execute!({ taskId: task.id }, ctx)) as AssignBySkillOutput;

      expect(result).toEqual({
        kind: 'superseded',
        taskId: task.id,
        currentAssigneeId: winner.user_id,
      });

      // And the assignment row did NOT get a second entry for `loser`
      const { rows } = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM planner.task_assignments WHERE task_id = $1`,
        [task.id],
      );
      expect(rows.map((r) => r.user_id)).toEqual([winner.user_id]);
    });
  });

  it('proceeds with the assignment when nobody else assigned in the meantime', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      await seedProjection(pool, {
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
        name: 'Admin',
      });
      const target = await createUser(
        { tenant_id, email: 'target@demo.local', name: 'Target', password: 'test-password' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, {
        tenant_id,
        user_id: target.user_id,
        email: 'target@demo.local',
        name: 'Target',
      });

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({ plan_id: plan.id, title: 'free', session });

      const tool = plannerSuggestAssigneeTool({ provider: fakeProvider, databaseUrl });
      const ctx = makeToolContext({ user_id: admin_user_id }) as ReturnType<
        typeof makeToolContext
      > & {
        agent: { resumeData: { action: 'assign'; assigneeUserId: string } };
      };
      ctx.agent = { resumeData: { action: 'assign', assigneeUserId: target.user_id } };

      const result = (await tool.execute!({ taskId: task.id }, ctx)) as AssignBySkillOutput;
      expect(result).toEqual({ kind: 'assigned', taskId: task.id, userId: target.user_id });
    });
  });
});
