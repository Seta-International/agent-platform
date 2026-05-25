import { randomUUID } from 'node:crypto';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { assignTask, createGroup, createPlan, createTask } from '@seta/planner';
import { describe, expect, it } from 'vitest';
import { plannerProposeAssignmentTool } from '../../../src/backend/agent-tools/propose-assignment.ts';
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

describe('planner_proposeAssignment', () => {
  it('suspends with a candidateList card and assigns on resume', async () => {
    await withCopilotTestDb(async ({ pool }) => {
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
      const candidates = await Promise.all(
        ['Alice', 'Bob', 'Carol'].map(async (name) => {
          const u = await createUser(
            {
              tenant_id,
              email: `${name.toLowerCase()}@demo.local`,
              name,
              password: 'test-password',
            },
            { type: 'user', user_id: admin_user_id },
          );
          await seedProjection(pool, {
            tenant_id,
            user_id: u.user_id,
            email: `${name.toLowerCase()}@demo.local`,
            name,
          });
          return u;
        }),
      );

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'pick someone',
        session,
      });

      const tool = plannerProposeAssignmentTool;

      // First call: suspend with the card
      const suspended: unknown[] = [];
      const suspendCtx = makeToolContext({ user_id: admin_user_id });
      // biome-ignore lint/suspicious/noExplicitAny: agent isn't on typed context
      (suspendCtx as any).agent = {
        toolCallId: 'tc-1',
        suspend: async (payload: unknown) => {
          suspended.push(payload);
        },
      };

      const suspendResult = await tool.execute!(
        {
          taskId: task.id,
          candidates: candidates.map((c, i) => ({
            userId: c.user_id,
            rationale: `Reason ${i}`,
            confidence: i === 0 ? ('high' as const) : ('medium' as const),
            signals: ['skill-match' as const],
          })),
          summary: 'Three candidates with strong skill overlap.',
        },
        suspendCtx,
      );
      expect(suspendResult).toBeUndefined();
      expect(suspended).toHaveLength(1);
      const card = suspended[0] as {
        details: Array<{ kind: string; items?: Array<{ id: string }> }>;
        summary: string;
        primary: { argsPatch?: { assigneeUserId: string } };
      };
      expect(card.details[0]?.kind).toBe('candidateList');
      expect(card.details[0]?.items).toHaveLength(3);
      expect(card.summary).toMatch(/strong skill overlap/);
      expect(card.primary.argsPatch?.assigneeUserId).toBe(candidates[0]!.user_id);

      // Second call: resume → assign winning candidate
      const resumeCtx = makeToolContext({ user_id: admin_user_id });
      // biome-ignore lint/suspicious/noExplicitAny: agent isn't on typed context
      (resumeCtx as any).agent = {
        toolCallId: 'tc-1',
        resumeData: { action: 'assign', assigneeUserId: candidates[1]!.user_id },
      };
      const finalResult = (await tool.execute!(
        {
          taskId: task.id,
          candidates: candidates.map((c) => ({
            userId: c.user_id,
            rationale: 'x',
            confidence: 'high' as const,
          })),
          summary: 'two candidates',
        },
        resumeCtx,
      )) as AssignBySkillOutput;
      expect(finalResult).toMatchObject({
        kind: 'assigned',
        taskId: task.id,
        userId: candidates[1]!.user_id,
      });
    });
  });

  it('returns superseded if task was assigned between suspend and resume (INV-1)', async () => {
    await withCopilotTestDb(async ({ pool }) => {
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
      const winner = await createUser(
        { tenant_id, email: 'win@demo.local', name: 'Win', password: 'test-password' },
        { type: 'user', user_id: admin_user_id },
      );
      const loser = await createUser(
        { tenant_id, email: 'lose@demo.local', name: 'Lose', password: 'test-password' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, {
        tenant_id,
        user_id: winner.user_id,
        email: 'win@demo.local',
        name: 'Win',
      });
      await seedProjection(pool, {
        tenant_id,
        user_id: loser.user_id,
        email: 'lose@demo.local',
        name: 'Lose',
      });

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({ plan_id: plan.id, title: 'race target', session });

      // simulate: workflow inbox assigned `winner` between suspend and resume
      await assignTask({ task_id: task.id, user_id: winner.user_id, session });

      const ctx = makeToolContext({ user_id: admin_user_id });
      // biome-ignore lint/suspicious/noExplicitAny: agent isn't on typed context
      (ctx as any).agent = {
        toolCallId: 'tc-2',
        resumeData: { action: 'assign', assigneeUserId: loser.user_id },
      };
      const result = (await plannerProposeAssignmentTool.execute!(
        {
          taskId: task.id,
          candidates: [
            { userId: winner.user_id, rationale: 'a', confidence: 'high' as const },
            { userId: loser.user_id, rationale: 'b', confidence: 'medium' as const },
          ],
          summary: 'two candidates',
        },
        ctx,
      )) as AssignBySkillOutput;
      expect(result).toMatchObject({
        kind: 'superseded',
        taskId: task.id,
        currentAssigneeId: winner.user_id,
      });
    });
  });

  it('rejects fewer than 2 candidates at schema validation', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      const ctx = makeToolContext({ user_id: admin_user_id });
      const result = (await plannerProposeAssignmentTool.execute!(
        {
          taskId: randomUUID(),
          candidates: [
            { userId: randomUUID(), rationale: 'x', confidence: 'high' as const },
          ] as unknown as never,
          summary: 'single',
        },
        ctx,
      )) as { error?: boolean };
      expect(result.error).toBe(true);
    });
  });
});
