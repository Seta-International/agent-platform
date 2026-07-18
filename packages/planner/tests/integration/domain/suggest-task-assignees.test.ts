import { PgVector } from '@mastra/pg';
import { AgentRegistry, type CrossModuleReadToolSpec } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import {
  addGroupMember,
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
import { plannerGetOpenTaskCountSpec } from '../../../src/backend/agent-tools/get-open-task-count.ts';
import { suggestTaskAssignees } from '../../../src/index.ts';
import { withAgentTestDb } from '../agent-tools-helpers.ts';
import { applyLabels } from '../label-test-helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));

function buildSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
  roles: string[];
}): SessionScope {
  const role_summary = { roles: opts.roles, cross_tenant_read: false, assignments: [] };
  return {
    session_id: crypto.randomUUID(),
    user_id: opts.user_id,
    tenant_id: opts.tenant_id,
    email: opts.email,
    display_name: 'Test User',
    role_summary,
    role_summary_hash: hashRoleSummary(role_summary),
    permissions: resolvePermissions(_registry, opts.roles, IMPLICIT_PERMISSIONS),
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
        z.object({ userId: z.string(), matchedSkills: z.array(z.string()), overlap: z.number() }),
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

describe('suggestTaskAssignees', () => {
  beforeEach(() => AgentRegistry.__resetForTests());
  afterEach(() => AgentRegistry.__resetForTests());

  it('returns ranked suggestions limited to plan group members', () =>
    withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@d.local',
        roles: ['org.admin'],
      });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'admin@d.local');

      const alice = await createUser(
        { tenant_id, email: 'alice@d.local', name: 'Alice', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, tenant_id, alice.user_id, 'Alice', 'alice@d.local', {
        skills: ['react', 'auth'],
      });

      const bob = await createUser(
        { tenant_id, email: 'bob@d.local', name: 'Bob', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, tenant_id, bob.user_id, 'Bob', 'bob@d.local', {
        skills: ['react'],
      });

      // High-skill NON-member: matches both labels but is never added to the
      // group, so assignTask would reject them — must be excluded here too.
      const outsider = await createUser(
        { tenant_id, email: 'outsider@d.local', name: 'Outsider', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      await seedProjection(pool, tenant_id, outsider.user_id, 'Outsider', 'outsider@d.local', {
        skills: ['react', 'auth'],
      });

      // Skill evidence for the three skilled users; the outsider matches too,
      // proving the group-membership gate (not a missing skill) is what
      // excludes them.
      registerFakeSkillExactTool([
        { userId: alice.user_id, matchedSkills: ['react', 'auth'], overlap: 2 },
        { userId: bob.user_id, matchedSkills: ['react'], overlap: 1 },
        { userId: outsider.user_id, matchedSkills: ['react', 'auth'], overlap: 2 },
      ]);
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

      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
      // outsider deliberately NOT added to the group.

      const memberIds = [admin_user_id, alice.user_id, bob.user_id];

      const pgVector = new PgVector({
        id: 'suggest-task-assignees-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        const out = await suggestTaskAssignees(
          { task_id: task.id, session },
          { provider: new FakeEmbeddingProvider(), pgVector, reranker: new NoopReranker() },
        );

        expect(out.length).toBeGreaterThan(0);
        for (const s of out) expect(memberIds).toContain(s.user_id);
        expect(out.map((s) => s.user_id)).not.toContain(outsider.user_id);

        const scores = out.map((s) => s.score);
        expect(scores).toEqual([...scores].sort((a, b) => b - a));
      } finally {
        await pgVector.disconnect().catch(() => {});
      }
    }));

  it('throws FORBIDDEN when the caller lacks planner.task.assign', () =>
    withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@d.local',
        roles: ['org.admin'],
      });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'admin@d.local');

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Task',
        session,
      });

      // No planner.task.assign on the viewer role.
      const viewer = buildSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@d.local',
        roles: ['planner.viewer'],
      });

      const pgVector = new PgVector({
        id: 'suggest-task-assignees-forbidden-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        await expect(
          suggestTaskAssignees(
            { task_id: task.id, session: viewer },
            { provider: new FakeEmbeddingProvider(), pgVector, reranker: new NoopReranker() },
          ),
        ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      } finally {
        await pgVector.disconnect().catch(() => {});
      }
    }));

  it('returns [] when there are no skill candidates', () =>
    withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@d.local',
        roles: ['org.admin'],
      });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'admin@d.local');

      registerFakeVectorTool([]);
      AgentRegistry.registerCrossModuleReadTool(plannerGetOpenTaskCountSpec);
      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      // No labels applied — task labels match nobody.
      const task = await createTask({
        plan_id: plan.id,
        title: 'Unlabeled task',
        session,
      });

      const pgVector = new PgVector({
        id: 'suggest-task-assignees-empty-test',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        const out = await suggestTaskAssignees(
          { task_id: task.id, session },
          { provider: new FakeEmbeddingProvider(), pgVector, reranker: new NoopReranker() },
        );
        expect(out).toEqual([]);
      } finally {
        await pgVector.disconnect().catch(() => {});
      }
    }));
});
