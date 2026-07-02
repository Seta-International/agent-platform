import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan, createTask } from '@seta/planner';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { plannerQueryTasksTool } from '../../../src/backend/agent-tools/query-tasks.ts';
import { plannerResolveMemberTool } from '../../../src/backend/agent-tools/resolve-member.ts';
import { assignTaskInGroup } from '../../helpers.ts';
import { makeToolContext, withAgentTestDb } from '../agent-tools-helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));

function buildAdminSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
}): SessionScope {
  const roles = ['org.admin'];
  const role_summary = { roles, cross_tenant_read: false, assignments: [] };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email,
    display_name: 'Admin',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: resolvePermissions(_registry, roles, IMPLICIT_PERMISSIONS),
    accessible_group_ids: [],
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
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
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.assignee_projection
       (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
     VALUES ($1, $2, $3, $4, ARRAY[]::text[], 'available', 'UTC')
     ON CONFLICT (user_id) DO NOTHING`,
    [user_id, tenant_id, display_name, email],
  );
}

const TOOL_PERMS = ['planner.task.read', 'planner.task.read.tenant', 'planner.group.member.read'];

describe('QnA identity resolution end-to-end (tool chain)', () => {
  it('assigneeScope "me" returns only the caller\'s tasks', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      const other = await createUser(
        { tenant_id, email: 'other@demo.local', name: 'Other', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });

      const mine1 = await createTask({ plan_id: plan.id, title: 'mine-1', session });
      const mine2 = await createTask({ plan_id: plan.id, title: 'mine-2', session });
      const theirs = await createTask({ plan_id: plan.id, title: 'other-task', session });
      await assignTaskInGroup({
        group_id: group.id,
        task_id: mine1.id,
        user_id: admin_user_id,
        session,
      });
      await assignTaskInGroup({
        group_id: group.id,
        task_id: mine2.id,
        user_id: admin_user_id,
        session,
      });
      await assignTaskInGroup({
        group_id: group.id,
        task_id: theirs.id,
        user_id: other.user_id,
        session,
      });

      const ctx = makeToolContext({
        user_id: admin_user_id,
        tenant_id,
        permissions: TOOL_PERMS,
      });
      const out = (await plannerQueryTasksTool.execute!({ assigneeScope: 'me' }, ctx)) as {
        tasks: { title: string }[];
      };

      expect(out.tasks.map((t) => t.title).sort()).toEqual(['mine-1', 'mine-2']);
    });
  });

  it("resolveMember -> queryTasks lists a named member's tasks", async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      const tuan = await createUser(
        { tenant_id, email: 'tuan@demo.local', name: 'Nguyen Tuan', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, tenant_id, tuan.user_id, 'Nguyen Tuan', 'tuan@demo.local');

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({ plan_id: plan.id, title: 'tuan-task', session });
      await assignTaskInGroup({
        group_id: group.id,
        task_id: task.id,
        user_id: tuan.user_id,
        session,
      });

      const ctx = makeToolContext({
        user_id: admin_user_id,
        tenant_id,
        permissions: TOOL_PERMS,
      });

      const resolved = (await plannerResolveMemberTool.execute!({ query: 'tuan' }, ctx)) as {
        candidates: { userId: string }[];
      };
      expect(resolved.candidates).toHaveLength(1);

      const theirs = (await plannerQueryTasksTool.execute!(
        { assigneeUserId: resolved.candidates[0]!.userId },
        ctx,
      )) as { tasks: { title: string }[] };
      expect(theirs.tasks.map((t) => t.title)).toContain('tuan-task');
    });
  });
});
