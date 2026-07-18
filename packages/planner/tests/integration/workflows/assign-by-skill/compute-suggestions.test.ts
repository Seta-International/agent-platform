import { PgVector } from '@mastra/pg';
import { AgentRegistry, type CrossModuleReadToolSpec } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import {
  addGroupMembers,
  createGroup,
  createPlan,
  createTask,
  PLANNER_VECTOR_NAMESPACE,
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
import { computeAssigneeSuggestions } from '../../../../src/backend/workflows/assign-by-skill/workflow.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';
import { applyLabels } from '../../label-test-helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));
function admin(opts: { tenant_id: string; user_id: string; email: string }): SessionScope {
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
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
    person_id: null,
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
  _opts: { skills?: string[] } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.assignee_projection
     (user_id, tenant_id, display_name, email, availability_status, timezone)
     VALUES ($1, $2, $3, $4, 'available', 'UTC')
     ON CONFLICT (user_id) DO NOTHING`,
    [user_id, tenant_id, display_name, email],
  );
}

function registerFakeSkillExactTool(
  hits: ReadonlyArray<{ userId: string; matchedSkills: string[]; overlap: number }>,
): void {
  const spec: CrossModuleReadToolSpec<
    { labels: string[] },
    { hits: Array<{ userId: string; matchedSkills: string[]; overlap: number }> }
  > = {
    id: 'people_searchUsersBySkillExact',
    description: 'fake',
    inputSchema: z.object({ labels: z.array(z.string()) }),
    outputSchema: z.object({
      hits: z.array(
        z.object({
          userId: z.string(),
          matchedSkills: z.array(z.string()),
          overlap: z.number(),
        }),
      ),
    }),
    rbac: 'identity.user.read',
    availableTo: 'all-specialists',
    execute: async () => ({ hits: [...hits] }),
  };
  AgentRegistry.registerCrossModuleReadTool(spec);
}

function registerFakeVectorTool(hits: ReadonlyArray<{ userId: string; score: number }>): void {
  const spec: CrossModuleReadToolSpec<
    { queryText: string; topK: number; minScore?: number },
    { hits: Array<{ userId: string; score: number }> }
  > = {
    id: 'people_searchUsersBySkillVector',
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

describe('computeAssigneeSuggestions', () => {
  beforeEach(() => AgentRegistry.__resetForTests());
  afterEach(() => AgentRegistry.__resetForTests());

  it('returns ranked candidates without building an approval card', () =>
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

      // Alice legitimately matches the task's labels — the only path that now
      // qualifies a candidate for the list (no skill evidence → no suggestion).
      registerFakeSkillExactTool([
        { userId: alice.user_id, matchedSkills: ['react', 'auth'], overlap: 2 },
      ]);
      registerFakeVectorTool([]);
      AgentRegistry.registerCrossModuleReadTool(plannerGetOpenTaskCountSpec);
      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      await addGroupMembers({ group_id: group.id, members: [{ user_id: alice.user_id }], session });
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
        id: 'compute-suggestions-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        const { task: loaded, candidates } = await computeAssigneeSuggestions(
          {
            taskId: task.id,
            session: {
              tenantId: tenant_id,
              userId: admin_user_id,
              roleSummary: { roles: ['org.admin'], cross_tenant_read: false },
            },
          },
          { provider: new FakeEmbeddingProvider(), pgVector, reranker: new NoopReranker() },
        );

        expect(loaded.taskId).toBe(task.id);
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.some((cand) => cand.userId === alice.user_id)).toBe(true);
        expect(candidates[0]!.finalScore).toBeGreaterThanOrEqual(candidates.at(-1)!.finalScore);
        expect(candidates[0]).toHaveProperty('finalScore');
        expect(candidates[0]).toHaveProperty('displayName');
      } finally {
        await pgVector.disconnect().catch(() => {});
      }
    }));

  it('ranks a no-label task deterministically by vector evidence', () =>
    withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = admin({ tenant_id, user_id: admin_user_id, email: 'a@d.local' });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'a@d.local');

      const alice = await createUser(
        { tenant_id, email: 'alice@d.local', name: 'Alice', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      const bob = await createUser(
        { tenant_id, email: 'bob@d.local', name: 'Bob', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, tenant_id, alice.user_id, 'Alice', 'alice@d.local');
      await seedProjection(pool, tenant_id, bob.user_id, 'Bob', 'bob@d.local');

      // No exact hits and the task carries NO labels — both enter the pool via
      // the vector branch alone. Deterministic ranking must still surface them
      // from that evidence, with no LLM in the path and no rationale attached.
      registerFakeSkillExactTool([]);
      registerFakeVectorTool([
        { userId: alice.user_id, score: 0.5 },
        { userId: bob.user_id, score: 0.5 },
      ]);
      AgentRegistry.registerCrossModuleReadTool(plannerGetOpenTaskCountSpec);
      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      await addGroupMembers({
        group_id: group.id,
        members: [{ user_id: alice.user_id }, { user_id: bob.user_id }],
        session,
      });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Scaffold a ReactJS monorepo',
        description: 'Set up the front-end.',
        session,
      });

      const pgVector = new PgVector({
        id: 'no-label-deterministic-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        const { candidates } = await computeAssigneeSuggestions(
          {
            taskId: task.id,
            session: {
              tenantId: tenant_id,
              userId: admin_user_id,
              roleSummary: { roles: ['org.admin'], cross_tenant_read: false },
            },
          },
          { provider: new FakeEmbeddingProvider(), pgVector, reranker: new NoopReranker() },
        );

        expect(new Set(candidates.map((c) => c.userId))).toEqual(
          new Set([alice.user_id, bob.user_id]),
        );
        expect(candidates.every((c) => c.rationale === null)).toBe(true);
      } finally {
        await pgVector.disconnect().catch(() => {});
      }
    }));
});
