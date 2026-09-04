import { requiredPermissionFor } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { addGroupMember, createGroup, createPlan, createTask } from '@seta/planner';
import { plannerSearchGroupMembersBySkillsTool } from '@seta/planner/agent-tools';
import {
  buildRegistry,
  IMPLICIT_PERMISSIONS,
  INVENTORY,
  inventoryToManifests,
  resolvePermissions,
} from '@seta/shared-rbac';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { assignTaskInGroup } from '../../helpers.ts';
import { makeToolContext, withAgentTestDb } from '../agent-tools-helpers.ts';

const _registry = buildRegistry(inventoryToManifests(INVENTORY));

// The tool now reads live skills from People (getPersonSkills joins person_skill →
// user_projection on the user↔person link). Seed a People person linked to the user with skills.
async function seedPeopleSkills(
  pool: Pool,
  tenantId: string,
  userId: string,
  skillNames: string[],
): Promise<void> {
  const personId = crypto.randomUUID();
  await pool.query(`INSERT INTO people.person (id, tenant_id) VALUES ($1, $2)`, [
    personId,
    tenantId,
  ]);
  await pool.query(
    `INSERT INTO people.user_projection (user_id, tenant_id, person_id) VALUES ($1, $2, $3)`,
    [userId, tenantId, personId],
  );
  for (const name of skillNames) {
    await pool.query(
      `INSERT INTO people.person_skill (id, tenant_id, person_id, skill_id, skill_name)
       VALUES (gen_random_uuid(), $1, $2, gen_random_uuid(), $3)`,
      [tenantId, personId, name],
    );
  }
}
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
    assignments: [],
    group_ids: [],
    product_access: new Set<string>(),
    person_id: null,
    cross_tenant_read: false,
    built_at: new Date(),
    invalidated_at: null,
  };
}

describe('planner_searchGroupMembersBySkills tool', () => {
  it('returns group members ranked by skill overlap', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      // Create assignee projections with skills for users
      const alice = await createUser(
        {
          tenant_id,
          email: 'alice@demo.local',
          name: 'Alice',
          password: 'password123456',
        },
        { type: 'cli', user_id: null },
      );
      const bob = await createUser(
        {
          tenant_id,
          email: 'bob@demo.local',
          name: 'Bob',
          password: 'password123456',
        },
        { type: 'cli', user_id: null },
      );
      const charlie = await createUser(
        {
          tenant_id,
          email: 'charlie@demo.local',
          name: 'Charlie',
          password: 'password123456',
        },
        { type: 'cli', user_id: null },
      );

      await seedPeopleSkills(pool, tenant_id, alice.user_id, ['TypeScript', 'React', 'PostgreSQL']);
      await seedPeopleSkills(pool, tenant_id, bob.user_id, ['TypeScript', 'Node.js']);
      await seedPeopleSkills(pool, tenant_id, charlie.user_id, ['Python', 'Django']);

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES
           ($1, $2, 'Alice', 'alice@demo.local', 'available', 'UTC'),
           ($3, $2, 'Bob', 'bob@demo.local', 'available', 'UTC'),
           ($4, $2, 'Charlie', 'charlie@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [alice.user_id, tenant_id, bob.user_id, charlie.user_id],
      );

      // Create assignee projection for admin
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: charlie.user_id, session });

      const result = (await plannerSearchGroupMembersBySkillsTool.execute!(
        {
          groupId: group.id,
          skills: ['TypeScript', 'React'],
          limit: 5,
        },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as {
        candidates: Array<{
          userId: string;
          displayName: string;
          matchedSkills: string[];
          score: number;
        }>;
      };

      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0]?.userId).toBe(alice.user_id);
      expect(result.candidates[0]?.displayName).toBe('Alice');
      expect(result.candidates[0]?.matchedSkills).toEqual(['typescript', 'react']);
      expect(result.candidates[0]?.score).toBe(2);

      expect(result.candidates[1]?.userId).toBe(bob.user_id);
      expect(result.candidates[1]?.displayName).toBe('Bob');
      expect(result.candidates[1]?.matchedSkills).toEqual(['typescript']);
      expect(result.candidates[1]?.score).toBe(1);
    });
  });

  it('respects limit parameter', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      const alice = await createUser(
        {
          tenant_id,
          email: 'alice@demo.local',
          name: 'Alice',
          password: 'password123456',
        },
        { type: 'cli', user_id: null },
      );
      const bob = await createUser(
        {
          tenant_id,
          email: 'bob@demo.local',
          name: 'Bob',
          password: 'password123456',
        },
        { type: 'cli', user_id: null },
      );
      const charlie = await createUser(
        {
          tenant_id,
          email: 'charlie@demo.local',
          name: 'Charlie',
          password: 'password123456',
        },
        { type: 'cli', user_id: null },
      );

      await seedPeopleSkills(pool, tenant_id, alice.user_id, ['TypeScript']);
      await seedPeopleSkills(pool, tenant_id, bob.user_id, ['TypeScript']);
      await seedPeopleSkills(pool, tenant_id, charlie.user_id, ['TypeScript']);

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES
           ($1, $2, 'Alice', 'alice@demo.local', 'available', 'UTC'),
           ($3, $2, 'Bob', 'bob@demo.local', 'available', 'UTC'),
           ($4, $2, 'Charlie', 'charlie@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [alice.user_id, tenant_id, bob.user_id, charlie.user_id],
      );

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: charlie.user_id, session });

      const result = (await plannerSearchGroupMembersBySkillsTool.execute!(
        {
          groupId: group.id,
          skills: ['TypeScript'],
          limit: 2,
        },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as {
        candidates: Array<{
          userId: string;
          displayName: string;
          matchedSkills: string[];
          score: number;
        }>;
      };

      expect(result.candidates).toHaveLength(2);
    });
  });

  it('excludes the current user and task assignees when taskId is provided', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      const alice = await createUser(
        {
          tenant_id,
          email: 'alice@demo.local',
          name: 'Alice',
          password: 'password123456',
        },
        { type: 'cli', user_id: null },
      );
      const bob = await createUser(
        {
          tenant_id,
          email: 'bob@demo.local',
          name: 'Bob',
          password: 'password123456',
        },
        { type: 'cli', user_id: null },
      );

      await seedPeopleSkills(pool, tenant_id, alice.user_id, ['AWS']);
      await seedPeopleSkills(pool, tenant_id, bob.user_id, ['AWS']);

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES
           ($1, $2, 'Admin', 'admin@demo.local', 'available', 'UTC'),
           ($3, $2, 'Alice', 'alice@demo.local', 'available', 'UTC'),
           ($4, $2, 'Bob', 'bob@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id, alice.user_id, bob.user_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      const plan = await createPlan({ group_id: group.id, name: 'Infra', session });
      const task = await createTask({ plan_id: plan.id, title: 'Review AWS spend', session });

      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
      await assignTaskInGroup({
        group_id: group.id,
        task_id: task.id,
        user_id: alice.user_id,
        session,
      });

      const result = (await plannerSearchGroupMembersBySkillsTool.execute!(
        {
          groupId: group.id,
          taskId: task.id,
          skills: ['AWS'],
          limit: 5,
        },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as {
        candidates: Array<{
          userId: string;
          displayName: string;
          matchedSkills: string[];
          score: number;
        }>;
      };

      expect(result.candidates.map((c) => c.userId)).toEqual([bob.user_id]);
    });
  });

  it('uses live People skills even when planner projection skills are stale', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
      const session = buildAdminSession({
        tenant_id,
        user_id: admin_user_id,
        email: 'admin@demo.local',
      });

      const alice = await createUser(
        {
          tenant_id,
          email: 'alice-profile@demo.local',
          name: 'Alice Profile',
          password: 'password123456',
        },
        { type: 'cli', user_id: null },
      );
      await seedPeopleSkills(pool, tenant_id, alice.user_id, ['AWS']);

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, availability_status, timezone)
         VALUES
           ($1, $2, 'Admin', 'admin@demo.local', 'available', 'UTC'),
           ($3, $2, 'Alice Projection', 'alice-profile@demo.local', 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id, alice.user_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });

      const result = (await plannerSearchGroupMembersBySkillsTool.execute!(
        {
          groupId: group.id,
          skills: ['AWS'],
          limit: 5,
        },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as {
        candidates: Array<{
          userId: string;
          displayName: string;
          matchedSkills: string[];
          score: number;
        }>;
      };

      expect(result.candidates).toEqual([
        {
          userId: alice.user_id,
          displayName: 'Alice Projection',
          matchedSkills: ['aws'],
          score: 1,
        },
      ]);
    });
  });

  it('is registered with permission planner.group.member.read', () => {
    expect(requiredPermissionFor(plannerSearchGroupMembersBySkillsTool)).toBe(
      'planner.group.member.read',
    );
  });

  it('reports a missing group through the recoverable error branch', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      const res = (await plannerSearchGroupMembersBySkillsTool.execute!(
        {
          groupId: crypto.randomUUID(),
          skills: ['TypeScript'],
          limit: 5,
        },
        makeToolContext({ user_id: admin_user_id, tenant_id }),
      )) as { candidates?: unknown[]; error?: string };

      expect(res.error).toMatch(/no accessible group/i);
      expect(res.candidates).toBeUndefined();
    });
  });
});
