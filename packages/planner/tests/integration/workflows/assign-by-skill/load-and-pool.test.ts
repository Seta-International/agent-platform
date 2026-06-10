import { AgentRegistry, type CrossModuleReadToolSpec } from '@seta/agent-sdk';
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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { candidatePool } from '../../../../src/backend/workflows/assign-by-skill/steps/candidate-pool.ts';
import { loadTask } from '../../../../src/backend/workflows/assign-by-skill/steps/load-task.ts';
import { withAgentTestDb } from '../../agent-tools-helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));
function adminSession(opts: { tenant_id: string; user_id: string; email: string }): SessionScope {
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
  opts: { skills?: string[]; timezone?: string } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO planner.assignee_projection
     (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
     VALUES ($1, $2, $3, $4, $5, 'available', $6)
     ON CONFLICT (user_id) DO UPDATE SET skills = EXCLUDED.skills, timezone = EXCLUDED.timezone`,
    [user_id, tenant_id, display_name, email, opts.skills ?? [], opts.timezone ?? 'UTC'],
  );
}

function registerFakeVectorTool(
  hitsByQuery: ReadonlyArray<{ userId: string; score: number }>,
): void {
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
    execute: async () => ({ hits: [...hitsByQuery] }),
  };
  AgentRegistry.registerCrossModuleReadTool(spec);
}

describe('loadTask + candidatePool', () => {
  beforeEach(() => {
    AgentRegistry.__resetForTests();
  });
  afterEach(() => {
    AgentRegistry.__resetForTests();
  });

  it('loadTask returns title, description, skill_tags', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = adminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@d.local',
      });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'admin@d.local');

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Fix login',
        description: 'OAuth flow broken',
        skill_tags: ['react', 'auth'],
        session,
      });

      const out = await loadTask({ tenantId: tenant_id, taskId: task.id });
      expect(out.title).toBe('Fix login');
      expect(out.description).toBe('OAuth flow broken');
      expect(out.skill_tags).toEqual(['react', 'auth']);
    });
  });

  it('candidatePool merges SQL exact-overlap and vector hits by userId', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = adminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@d.local',
      });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'admin@d.local');

      const aliceId = (
        await createUser(
          { tenant_id, email: 'a@d.local', name: 'Alice', password: 'ChangeMe@2026' },
          { type: 'user', user_id: admin_user_id },
        )
      ).user_id;
      await seedProjection(pool, tenant_id, aliceId, 'Alice', 'a@d.local', {
        skills: ['react', 'auth'],
      });

      const bobId = (
        await createUser(
          { tenant_id, email: 'b@d.local', name: 'Bob', password: 'ChangeMe@2026' },
          { type: 'user', user_id: admin_user_id },
        )
      ).user_id;
      await seedProjection(pool, tenant_id, bobId, 'Bob', 'b@d.local', {
        skills: ['frontend', 'oauth'],
      });

      // Stub the vector branch — Bob shows up only here, Alice's score is
      // additive on top of her exact overlap.
      registerFakeVectorTool([
        { userId: aliceId, score: 0.85 },
        { userId: bobId, score: 0.72 },
      ]);
      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'Fix login',
        description: 'oauth flow',
        skill_tags: ['react', 'auth'],
        session,
      });

      const t = await loadTask({ tenantId: tenant_id, taskId: task.id });
      const pool_ = await candidatePool({
        tenantId: tenant_id,
        callerUserId: admin_user_id,
        callerRoleSummary: { roles: ['org.admin'], cross_tenant_read: false },
        task: t,
      });

      const byId = new Map(pool_.map((c) => [c.userId, c]));
      expect(byId.get(aliceId)).toMatchObject({
        displayName: 'Alice',
        exactOverlap: 2,
        vectorScore: 0.85,
      });
      expect(byId.get(bobId)).toMatchObject({
        displayName: 'Bob',
        exactOverlap: 0,
        vectorScore: 0.72,
      });
    });
  });

  it('excludes deactivated and OOO users from SQL branch', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = adminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@d.local',
      });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'admin@d.local');

      const dz = (
        await createUser(
          { tenant_id, email: 'dz@d.local', name: 'Deactivated', password: 'ChangeMe@2026' },
          { type: 'user', user_id: admin_user_id },
        )
      ).user_id;
      await seedProjection(pool, tenant_id, dz, 'DZ', 'dz@d.local', { skills: ['rust'] });
      await pool.query(
        `UPDATE planner.assignee_projection SET deactivated_at = now() WHERE user_id = $1`,
        [dz],
      );

      const ooo = (
        await createUser(
          { tenant_id, email: 'ooo@d.local', name: 'OOO', password: 'ChangeMe@2026' },
          { type: 'user', user_id: admin_user_id },
        )
      ).user_id;
      await seedProjection(pool, tenant_id, ooo, 'OOO', 'ooo@d.local', { skills: ['rust'] });
      await pool.query(
        `UPDATE planner.assignee_projection SET availability_status = 'ooo' WHERE user_id = $1`,
        [ooo],
      );

      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'rust',
        skill_tags: ['rust'],
        session,
      });

      const t = await loadTask({ tenantId: tenant_id, taskId: task.id });
      const pool_ = await candidatePool({
        tenantId: tenant_id,
        callerUserId: admin_user_id,
        callerRoleSummary: { roles: ['org.admin'], cross_tenant_read: false },
        task: t,
      });
      const ids = pool_.map((c) => c.userId);
      expect(ids).not.toContain(dz);
      expect(ids).not.toContain(ooo);
    });
  });

  it('returns [] when no skill_tags and no vector tool registered', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = adminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@d.local',
      });
      await seedProjection(pool, tenant_id, admin_user_id, 'Admin', 'admin@d.local');

      AgentRegistry.freeze();

      const group = await createGroup({ tenant_id, name: 'G', session });
      const plan = await createPlan({ group_id: group.id, name: 'P', session });
      const task = await createTask({
        plan_id: plan.id,
        title: 'No tags',
        session,
      });

      const t = await loadTask({ tenantId: tenant_id, taskId: task.id });
      const out = await candidatePool({
        tenantId: tenant_id,
        callerUserId: admin_user_id,
        callerRoleSummary: { roles: ['org.admin'], cross_tenant_read: false },
        task: t,
      });
      expect(out).toEqual([]);
    });
  });
});
