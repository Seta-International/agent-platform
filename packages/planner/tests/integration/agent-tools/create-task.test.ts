import { randomUUID } from 'node:crypto';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan } from '@seta/planner';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { describe, expect, it } from 'vitest';
import { plannerCreateTaskTool } from '../../../src/backend/agent-tools/create-task.ts';
import { makeToolContext, withAgentTestDb } from '../agent-tools-helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));
function buildAdminSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
}): SessionScope {
  const roles = ['org.admin'];
  const role_summary = { roles, cross_tenant_read: false };
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
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

function makeMockMastra(opts?: { workflowMissing?: boolean }) {
  const startCalls: { inputData: unknown; requestContext: unknown }[] = [];
  const mockRunId = randomUUID();
  return {
    startCalls,
    mockRunId,
    mastra: {
      getWorkflow: (_id: string) => {
        if (opts?.workflowMissing) return undefined;
        return {
          createRun: async () => ({
            runId: mockRunId,
            start: async (args: { inputData: unknown; requestContext: unknown }) => {
              startCalls.push(args);
            },
          }),
        };
      },
    },
  };
}

async function seedPlan(pool: import('pg').Pool) {
  const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
  const session = buildAdminSession({
    tenant_id,
    user_id: admin_user_id,
    email: 'admin@demo.local',
  });
  const group = await createGroup({ tenant_id, name: 'Test Group', session });
  const plan = await createPlan({ group_id: group.id, name: 'Test Plan', session });
  return { tenant_id, admin_user_id, plan };
}

describe('planner_createTask — triggers dedupOnCreate workflow', () => {
  it('starts the dedupOnCreate workflow and returns runId', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id, plan } = await seedPlan(pool);
      const { mastra, mockRunId, startCalls } = makeMockMastra();
      const tool = plannerCreateTaskTool();
      const ctx = makeToolContext({ user_id: admin_user_id, tenant_id });
      // biome-ignore lint/suspicious/noExplicitAny: inject mock mastra
      (ctx as any).mastra = mastra;

      const result = (await tool.execute!(
        {
          title: 'New task X',
          description: 'desc',
          labels: [],
          plan_id: plan.id,
          bucket_id: undefined,
        },
        ctx,
      )) as { kind: string; runId?: string };

      expect(result.kind).toBe('workflow-started');
      expect(result.runId).toBe(mockRunId);
      // Workflow start was called (fire-and-forget, may resolve after test)
      await new Promise((r) => setTimeout(r, 10));
      expect(startCalls.length).toBe(1);
      expect((startCalls[0]!.inputData as { title: string }).title).toBe('New task X');
    });
  });

  it('keeps the created task when mastra is not available', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id, plan } = await seedPlan(pool);
      const tool = plannerCreateTaskTool();
      const ctx = makeToolContext({ user_id: admin_user_id, tenant_id });
      // No mastra on context

      const result = (await tool.execute!(
        { title: 't', description: '', labels: [], plan_id: plan.id, bucket_id: undefined },
        ctx,
      )) as { kind: string; taskId?: string };

      expect(result.kind).toBe('kept');
      expect(result.taskId).toEqual(expect.any(String));
    });
  });

  it('keeps the created task when dedupOnCreate workflow is not registered', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id, plan } = await seedPlan(pool);
      const { mastra } = makeMockMastra({ workflowMissing: true });
      const tool = plannerCreateTaskTool();
      const ctx = makeToolContext({ user_id: admin_user_id, tenant_id });
      // biome-ignore lint/suspicious/noExplicitAny: inject mock mastra
      (ctx as any).mastra = mastra;

      const result = (await tool.execute!(
        { title: 't', description: '', labels: [], plan_id: plan.id, bucket_id: undefined },
        ctx,
      )) as { kind: string; taskId?: string };

      expect(result.kind).toBe('kept');
      expect(result.taskId).toEqual(expect.any(String));
    });
  });
});
