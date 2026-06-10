import { PgVector } from '@mastra/pg';
import { AgentRegistry } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { createGroup, createPlan, createTask, PLANNER_VECTOR_NAMESPACE } from '@seta/planner';
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
import { runSuggestAssignee } from '../../../../src/backend/workflows/assign-by-skill/workflow.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';

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

describe('assignBySkill graceful degradation', () => {
  beforeEach(() => AgentRegistry.__resetForTests());
  afterEach(() => AgentRegistry.__resetForTests());

  it('task with no skill_tags but rich description still produces a card (vector + history carry)', () =>
    withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = admin({ tenant_id, user_id: admin_user_id, email: 'a@d.local' });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'a@d.local');
      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Help with the React migration',
        description: 'Looking for someone who can help upgrade our React 17 codebase',
        session,
      });

      const pgVector = new PgVector({
        id: 'gd-test-1',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        const { card } = await runSuggestAssignee(
          {
            taskId: task.id,
            session: {
              tenantId: tenant_id,
              userId: admin_user_id,
              roleSummary: { roles: ['org.admin'], cross_tenant_read: false },
            },
            toolCallId: 'tc',
          },
          { provider: new FakeEmbeddingProvider(), pgVector, reranker: new NoopReranker() },
        );
        expect(card).toBeDefined();
        expect(card.toolCallId).toBe('tc');
      } finally {
        await pgVector.disconnect().catch(() => {});
      }
    }));

  it('no embedded users + no cross-module reads → empty card, no crash', () =>
    withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = admin({ tenant_id, user_id: admin_user_id, email: 'a@d.local' });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'a@d.local');
      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'rust',
        skill_tags: ['rust'],
        session,
      });

      const pgVector = new PgVector({
        id: 'gd-test-2',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        const { candidates, card } = await runSuggestAssignee(
          {
            taskId: task.id,
            session: {
              tenantId: tenant_id,
              userId: admin_user_id,
              roleSummary: { roles: ['org.admin'], cross_tenant_read: false },
            },
            toolCallId: 'tc',
          },
          { provider: new FakeEmbeddingProvider(), pgVector, reranker: new NoopReranker() },
        );
        expect(candidates).toEqual([]);
        expect(card.alternates).toEqual([]);
        expect(card.summary).toMatch(/No candidates/i);
        expect(card.decline.label).toBe('Leave unassigned');
      } finally {
        await pgVector.disconnect().catch(() => {});
      }
    }));

  it('user has exact-overlap skills but no embedding row → still surfaces', () =>
    withAgentTestDb(async ({ pool, databaseUrl }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = admin({ tenant_id, user_id: admin_user_id, email: 'a@d.local' });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'a@d.local');

      const rustacean = await createUser(
        { tenant_id, email: 'r@d.local', name: 'Rusty', password: 'ChangeMe@2026' },
        { type: 'user', user_id: admin_user_id },
      );
      // Has skills in projection but no embedding row was written.
      await seedProjection(pool, tenant_id, rustacean.user_id, 'Rusty', 'r@d.local', {
        skills: ['rust'],
      });
      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'rust audit',
        skill_tags: ['rust'],
        session,
      });

      const pgVector = new PgVector({
        id: 'gd-test-3',
        connectionString: databaseUrl,
        schemaName: PLANNER_VECTOR_NAMESPACE,
      });
      try {
        const { candidates } = await runSuggestAssignee(
          {
            taskId: task.id,
            session: {
              tenantId: tenant_id,
              userId: admin_user_id,
              roleSummary: { roles: ['org.admin'], cross_tenant_read: false },
            },
            toolCallId: 'tc',
          },
          { provider: new FakeEmbeddingProvider(), pgVector, reranker: new NoopReranker() },
        );
        expect(candidates.map((c) => c.userId)).toContain(rustacean.user_id);
      } finally {
        await pgVector.disconnect().catch(() => {});
      }
    }));
});
