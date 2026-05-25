import { randomUUID } from 'node:crypto';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan } from '@seta/planner';
import { describe, expect, it } from 'vitest';
import { plannerCreateTaskTool } from '../../../src/backend/agent-tools/create-task.ts';
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

describe('planner_createTask — thin confirm-and-create', () => {
  it('suspends with a confirm card on first call', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      const tool = plannerCreateTaskTool();
      const suspended: unknown[] = [];
      const ctx = makeToolContext({ user_id: admin_user_id });
      // biome-ignore lint/suspicious/noExplicitAny: agent isn't on typed context
      (ctx as any).agent = {
        toolCallId: 'tc-c1',
        suspend: async (p: unknown) => {
          suspended.push(p);
        },
      };

      const result = await tool.execute!(
        {
          title: 'New task X',
          description: 'desc',
          skill_tags: [],
          plan_id: undefined,
          bucket_id: undefined,
        },
        ctx,
      );
      expect(result).toBeUndefined();
      const card = suspended[0] as { primary: { label: string }; summary: string };
      expect(card.summary).toMatch(/Create "New task X"/);
      expect(card.primary.label).toBe('Create');
    });
  });

  it('creates the task on resume=confirm', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });
      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });

      const tool = plannerCreateTaskTool();
      const ctx = makeToolContext({ user_id: admin_user_id });
      // biome-ignore lint/suspicious/noExplicitAny: agent isn't on typed context
      (ctx as any).agent = {
        toolCallId: 'tc-c2',
        resumeData: { action: 'confirm' },
      };

      const result = (await tool.execute!(
        {
          title: 'create me',
          description: '',
          skill_tags: [],
          plan_id: plan.id,
          bucket_id: undefined,
        },
        ctx,
      )) as { kind: string; taskId?: string };
      expect(result.kind).toBe('created');
      expect(result.taskId).toBeTruthy();
    });
  });

  it('returns cancelled on resume=cancel', async () => {
    await withCopilotTestDb(async ({ pool }) => {
      const { admin_user_id } = await createTestTenantWithAdmin({ pool });
      const tool = plannerCreateTaskTool();
      const ctx = makeToolContext({ user_id: admin_user_id });
      // biome-ignore lint/suspicious/noExplicitAny: agent isn't on typed context
      (ctx as any).agent = {
        toolCallId: 'tc-c3',
        resumeData: { action: 'cancel' },
      };
      const result = (await tool.execute!(
        { title: 't', description: '', skill_tags: [], plan_id: undefined, bucket_id: undefined },
        ctx,
      )) as { kind: string };
      expect(result.kind).toBe('cancelled');
    });
  });
});
