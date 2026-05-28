import { randomUUID } from 'node:crypto';
import { type ApprovalCard, RC_CHAT_HITL_RECORDER } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { assignTask, createGroup, createPlan, createTask } from '@seta/planner';
import { describe, expect, it } from 'vitest';
import { plannerProposeAssignmentTool } from '../../../src/backend/agent-tools/propose-assignment.ts';
import { plannerProposeAssignmentChatHitlDecider } from '../../../src/backend/agent-tools/propose-assignment-chat-hitl-decider.ts';
import { makeToolContext, withAgentTestDb } from '../agent-tools-helpers.ts';

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
  it('records a candidateList approval card for multiple candidates', async () => {
    await withAgentTestDb(async ({ pool }) => {
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
          return { user_id: u.user_id, name };
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

      const recorded: ApprovalCard[] = [];
      const suspendCtx = makeToolContext({ user_id: admin_user_id, tenant_id });
      suspendCtx.requestContext?.set(RC_CHAT_HITL_RECORDER, async (card: ApprovalCard) => {
        recorded.push(card);
        return { runId: randomUUID(), approvalId: randomUUID() };
      });
      // biome-ignore lint/suspicious/noExplicitAny: agent isn't on typed context
      (suspendCtx as any).agent = { toolCallId: 'tc-1' };

      const suspendResult = await tool.execute!(
        {
          taskId: task.id,
          candidates: candidates.map((c, i) => ({
            userId: c.user_id,
            displayName: c.name,
            rationale: `Reason ${i}`,
            confidence: i === 0 ? ('high' as const) : ('medium' as const),
            signals: ['skill-match' as const],
          })),
          summary: 'Three candidates with strong skill overlap.',
        },
        suspendCtx,
      );
      expect(suspendResult).toMatchObject({ kind: 'pending-approval', taskId: task.id });
      expect(recorded).toHaveLength(1);
      const card = recorded[0] as {
        details: Array<{ kind: string; items?: Array<{ id: string }> }>;
        summary: string;
        primary: { argsPatch?: { assigneeUserIds: string[] } };
      };
      expect(card.details[0]?.kind).toBe('candidateList');
      expect(card.details[0]?.items).toHaveLength(3);
      expect(card.summary).toMatch(/strong skill overlap/);
      expect(card.primary.argsPatch?.assigneeUserIds?.[0]).toBe(candidates[0]!.user_id);
    });
  });

  it('does not double-write when the task was already assigned before approval decision (INV-1)', async () => {
    await withAgentTestDb(async ({ pool }) => {
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

      const card: ApprovalCard = {
        toolCallId: 'tc-2',
        intent: `Assign task ${task.id} based on agent reasoning`,
        riskBadge: 'write',
        summary: 'Assign loser',
        details: [
          {
            kind: 'candidateList',
            items: [{ id: loser.user_id, label: 'Lose', secondary: 'b' }],
          },
        ],
        primary: {
          label: 'Assign to Lose',
          argsPatch: { action: 'assign', assigneeUserIds: [loser.user_id], taskId: task.id },
        },
        alternates: [],
        decline: { label: 'Leave unassigned' },
        meta: {
          tenantId: tenant_id,
          userId: admin_user_id,
          agentPath: ['supervisor', 'work', 'planner'],
          toolId: 'planner_proposeAssignment',
          ts: new Date().toISOString(),
        },
      };

      await plannerProposeAssignmentChatHitlDecider({
        decision: 'approve',
        proposedPayload: card,
        session: { user_id: admin_user_id, tenant_id },
      });

      const rows = await pool.query<{ user_id: string }>(
        `SELECT user_id FROM planner.task_assignments WHERE task_id = $1 ORDER BY user_id`,
        [task.id],
      );
      expect(rows.rows.map((r) => r.user_id)).toEqual([loser.user_id, winner.user_id].sort());
    });
  });

  it('records an approval card for a single named assignee', async () => {
    await withAgentTestDb(async ({ pool }) => {
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
      const nam = await createUser(
        {
          tenant_id,
          email: 'nam@demo.local',
          name: 'Nguyễn Văn Nam',
          password: 'test-password',
        },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, {
        tenant_id,
        user_id: nam.user_id,
        email: 'nam@demo.local',
        name: 'Nguyễn Văn Nam',
      });

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({ plan_id: plan.id, title: 'direct assign target', session });

      const recorded: ApprovalCard[] = [];
      const ctx = makeToolContext({ user_id: admin_user_id, tenant_id });
      ctx.requestContext?.set(RC_CHAT_HITL_RECORDER, async (card: ApprovalCard) => {
        recorded.push(card);
        return { runId: randomUUID(), approvalId: randomUUID() };
      });
      // biome-ignore lint/suspicious/noExplicitAny: agent isn't on typed context
      (ctx as any).agent = { toolCallId: 'tc-single' };

      const result = await plannerProposeAssignmentTool.execute!(
        {
          taskId: task.id,
          candidates: [
            {
              userId: nam.user_id,
              displayName: 'Nguyễn Văn Nam',
              rationale: 'User explicitly requested this assignee.',
              confidence: 'high' as const,
            },
          ],
          summary: 'Assign the task to Nguyễn Văn Nam as requested.',
        },
        ctx,
      );

      expect(result).toMatchObject({ kind: 'pending-approval', taskId: task.id });
      expect(recorded).toHaveLength(1);
      const detail = recorded[0]?.details[0];
      expect(detail?.kind).toBe('candidateList');
      if (detail?.kind !== 'candidateList') throw new Error('expected candidateList detail');
      expect(detail.items).toHaveLength(1);
      expect(recorded[0]?.primary?.label).toBe('Assign to Nguyễn Văn Nam');
      expect(recorded[0]?.primary?.argsPatch).toMatchObject({
        action: 'assign',
        assigneeUserIds: [nam.user_id],
        taskId: task.id,
      });
    });
  });
});
