import { PgVector } from '@mastra/pg';
import { AgentRegistry, type CrossModuleReadToolSpec } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import {
  createGroup,
  createPlan,
  createTask,
  PLANNER_VECTOR_NAMESPACE,
  assignTask as plannerAssignTask,
} from '@seta/planner';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import { NoopReranker } from '@seta/shared-retrieval';
import { FakeEmbeddingProvider } from '@seta/shared-testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { plannerGetOpenTaskCountSpec } from '../../../../src/backend/agent-tools/get-open-task-count.ts';
import {
  applyAssignDecision,
  runSuggestAssignee,
} from '../../../../src/backend/workflows/assign-by-skill/workflow.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { applyLabels } from '../../label-test-helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));
function admin(opts: { tenant_id: string; user_id: string; email: string }): SessionScope {
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

async function seedProjection(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  tenant_id: string,
  user_id: string,
  display_name: string,
  email: string,
  opts: { skills?: string[] } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.assignee_projection
     (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
     VALUES ($1, $2, $3, $4, $5, 'available', 'UTC')
     ON CONFLICT (user_id) DO UPDATE SET skills = EXCLUDED.skills`,
    [user_id, tenant_id, display_name, email, opts.skills ?? []],
  );
}

function registerFakeVectorTool(hits: ReadonlyArray<{ userId: string; score: number }>): void {
  const spec: CrossModuleReadToolSpec<
    { queryText: string; topK: number; minScore?: number },
    { hits: Array<{ userId: string; score: number }> }
  > = {
    id: 'identity_searchUsersBySkillVector',
    description: 'fake',
    inputSchema: z.object({
      queryText: z.string(),
      topK: z.number(),
      minScore: z.number().optional(),
    }),
    outputSchema: z.object({
      hits: z.array(z.object({ userId: z.string(), score: z.number() })),
    }),
    rbac: 'identity.user.read',
    availableTo: 'all-specialists',
    execute: async () => ({ hits: [...hits] }),
  };
  AgentRegistry.registerCrossModuleReadTool(spec);
}

describe('runSuggestAssignee + applyAssignDecision', () => {
  beforeEach(() => AgentRegistry.__resetForTests());
  afterEach(() => AgentRegistry.__resetForTests());

  it('end-to-end: builds a ranked card, then assigns on approve', () =>
    withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = admin({ tenant_id, user_id: admin_user_id, email: 'a@d.local' });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'a@d.local');

      const alice = await createUser(
        { tenant_id, email: 'alice@d.local', name: 'Alice', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, tenant_id, alice.user_id, 'Alice', 'alice@d.local', {
        skills: ['react', 'auth'],
      });

      registerFakeVectorTool([]);
      AgentRegistry.registerCrossModuleReadTool(plannerGetOpenTaskCountSpec);
      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Fix login',
        description: 'OAuth flow broken',
        session,
      });
      await applyLabels(pool, {
        tenant_id,
        plan_id: plan.id,
        task_id: task.id,
        applied_by: admin_user_id,
        names: ['react', 'auth'],
      });

      const pgVector = new PgVector({
        id: 'wf-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        const {
          task: loaded,
          candidates,
          card,
        } = await runSuggestAssignee(
          {
            taskId: task.id,
            session: {
              tenantId: tenant_id,
              userId: admin_user_id,
              roleSummary: { roles: ['org.admin'], cross_tenant_read: false },
            },
            toolCallId: 'tc_1',
          },
          { provider: new FakeEmbeddingProvider(), pgVector, reranker: new NoopReranker() },
        );

        expect(loaded.taskId).toBe(task.id);
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates[0]!.userId).toBe(alice.user_id);
        expect(card.primary.argsPatch).toEqual({
          action: 'assign',
          assigneeUserIds: [alice.user_id],
        });
        expect(card.summary).toContain('Alice');

        const out = await applyAssignDecision(
          {
            taskId: task.id,
            decision: { action: 'assign', assigneeUserIds: [alice.user_id] },
            session,
          },
          { assignTask: plannerAssignTask },
        );
        expect(out).toEqual({ kind: 'assigned', taskId: task.id, userIds: [alice.user_id] });

        const { rows } = await pool.query(
          `SELECT * FROM planner.task_assignments WHERE task_id = $1 AND user_id = $2`,
          [task.id, alice.user_id],
        );
        expect(rows).toHaveLength(1);
      } finally {
        await pgVector.disconnect().catch(() => {});
      }
    }));

  it('decision = leave-unassigned does not assign', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = admin({ tenant_id, user_id: admin_user_id, email: 'a@d.local' });
      const out = await applyAssignDecision(
        {
          taskId: crypto.randomUUID(),
          decision: { action: 'leave-unassigned' },
          session,
        },
        {
          assignTask: async () => {
            throw new Error('should not call');
          },
        },
      );
      expect(out.kind).toBe('left-unassigned');
    }));

  it('decision = assign with multiple userIds writes one row per user', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = admin({ tenant_id, user_id: admin_user_id, email: 'a@d.local' });
      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Pair on auth',
        description: 'Two engineers',
        session,
      });
      const u1 = await createUser(
        { tenant_id, email: 'one@d.local', name: 'One', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      const u2 = await createUser(
        { tenant_id, email: 'two@d.local', name: 'Two', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );

      const out = await applyAssignDecision(
        {
          taskId: task.id,
          decision: { action: 'assign', assigneeUserIds: [u1.user_id, u2.user_id] },
          session,
        },
        { assignTask: plannerAssignTask },
      );
      expect(out).toEqual({
        kind: 'assigned',
        taskId: task.id,
        userIds: [u1.user_id, u2.user_id],
      });

      const { rows } = await pool.query(
        `SELECT user_id FROM planner.task_assignments WHERE task_id = $1 ORDER BY user_id`,
        [task.id],
      );
      expect(rows.map((r: { user_id: string }) => r.user_id).sort()).toEqual(
        [u1.user_id, u2.user_id].sort(),
      );
    }));

  it('decision = decline returns declined', () =>
    withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = admin({ tenant_id, user_id: admin_user_id, email: 'a@d.local' });
      const out = await applyAssignDecision(
        {
          taskId: crypto.randomUUID(),
          decision: { action: 'decline' },
          session,
        },
        {
          assignTask: async () => {
            throw new Error('should not call');
          },
        },
      );
      expect(out.kind).toBe('declined');
    }));
});
