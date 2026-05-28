import { requiredPermissionFor } from '@seta/agent-sdk';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser, updateUserProfile } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { addGroupMember, assignTask, createGroup, createPlan, createTask } from '@seta/planner';
import { identitySearchUsersBySkillsTool } from '@seta/planner/agent-tools';
import { describe, expect, it } from 'vitest';
import { makeToolContext, withAgentTestDb } from '../agent-tools-helpers.ts';

function buildAdminSession(opts: {
  tenant_id: string;
  user_id: string;
  email: string;
}): SessionScope {
  const role_summary = { roles: ['org.admin'], cross_tenant_read: false };
  return {
    session_id: crypto.randomUUID(),
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

describe('identity_searchUsersBySkills tool', () => {
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

      await updateUserProfile(
        alice.user_id,
        { skills: ['TypeScript', 'React', 'PostgreSQL'] },
        { type: 'cli', user_id: null },
      );
      await updateUserProfile(
        bob.user_id,
        { skills: ['TypeScript', 'Node.js'] },
        { type: 'cli', user_id: null },
      );
      await updateUserProfile(
        charlie.user_id,
        { skills: ['Python', 'Django'] },
        { type: 'cli', user_id: null },
      );

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES
           ($1, $2, 'Alice', 'alice@demo.local', ARRAY['TypeScript', 'React', 'PostgreSQL'], 'available', 'UTC'),
           ($3, $2, 'Bob', 'bob@demo.local', ARRAY['TypeScript', 'Node.js'], 'available', 'UTC'),
           ($4, $2, 'Charlie', 'charlie@demo.local', ARRAY['Python', 'Django'], 'available', 'UTC')
         ON CONFLICT (user_id) DO UPDATE SET skills = EXCLUDED.skills`,
        [alice.user_id, tenant_id, bob.user_id, charlie.user_id],
      );

      // Create assignee projection for admin
      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: charlie.user_id, session });

      const result = (await identitySearchUsersBySkillsTool.execute!(
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

      await updateUserProfile(
        alice.user_id,
        { skills: ['TypeScript'] },
        { type: 'cli', user_id: null },
      );
      await updateUserProfile(
        bob.user_id,
        { skills: ['TypeScript'] },
        { type: 'cli', user_id: null },
      );
      await updateUserProfile(
        charlie.user_id,
        { skills: ['TypeScript'] },
        { type: 'cli', user_id: null },
      );

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES
           ($1, $2, 'Alice', 'alice@demo.local', ARRAY['TypeScript'], 'available', 'UTC'),
           ($3, $2, 'Bob', 'bob@demo.local', ARRAY['TypeScript'], 'available', 'UTC'),
           ($4, $2, 'Charlie', 'charlie@demo.local', ARRAY['TypeScript'], 'available', 'UTC')
         ON CONFLICT (user_id) DO UPDATE SET skills = EXCLUDED.skills`,
        [alice.user_id, tenant_id, bob.user_id, charlie.user_id],
      );

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO NOTHING`,
        [admin_user_id, tenant_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: charlie.user_id, session });

      const result = (await identitySearchUsersBySkillsTool.execute!(
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

      await updateUserProfile(alice.user_id, { skills: ['AWS'] }, { type: 'cli', user_id: null });
      await updateUserProfile(bob.user_id, { skills: ['AWS'] }, { type: 'cli', user_id: null });

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES
           ($1, $2, 'Admin', 'admin@demo.local', ARRAY['AWS'], 'available', 'UTC'),
           ($3, $2, 'Alice', 'alice@demo.local', ARRAY['AWS'], 'available', 'UTC'),
           ($4, $2, 'Bob', 'bob@demo.local', ARRAY['AWS'], 'available', 'UTC')
         ON CONFLICT (user_id) DO UPDATE SET skills = EXCLUDED.skills`,
        [admin_user_id, tenant_id, alice.user_id, bob.user_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      const plan = await createPlan({ group_id: group.id, name: 'Infra', session });
      const task = await createTask({ plan_id: plan.id, title: 'Review AWS spend', session });

      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });
      await addGroupMember({ group_id: group.id, user_id: bob.user_id, session });
      await assignTask({ task_id: task.id, user_id: alice.user_id, session });

      const result = (await identitySearchUsersBySkillsTool.execute!(
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

  it('uses identity profile skills even when planner projection skills are stale', async () => {
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
      await updateUserProfile(alice.user_id, { skills: ['AWS'] }, { type: 'cli', user_id: null });

      await pool.query(
        `INSERT INTO planner.assignee_projection
         (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
         VALUES
           ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC'),
           ($3, $2, 'Alice Projection', 'alice-profile@demo.local', ARRAY[]::text[], 'available', 'UTC')
         ON CONFLICT (user_id) DO UPDATE SET skills = EXCLUDED.skills`,
        [admin_user_id, tenant_id, alice.user_id],
      );

      const group = await createGroup({ tenant_id, name: 'Engineering', session });
      await addGroupMember({ group_id: group.id, user_id: alice.user_id, session });

      const result = (await identitySearchUsersBySkillsTool.execute!(
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
          displayName: 'Alice Profile',
          matchedSkills: ['aws'],
          score: 1,
        },
      ]);
    });
  });

  it('is registered with permission planner.group.member.read', () => {
    expect(requiredPermissionFor(identitySearchUsersBySkillsTool)).toBe(
      'planner.group.member.read',
    );
  });

  it('throws when group does not exist', async () => {
    await withAgentTestDb(async ({ pool }) => {
      const { admin_user_id, tenant_id } = await createTestTenantWithAdmin({ pool });
      await expect(
        identitySearchUsersBySkillsTool.execute!(
          {
            groupId: crypto.randomUUID(),
            skills: ['TypeScript'],
            limit: 5,
          },
          makeToolContext({ user_id: admin_user_id, tenant_id }),
        ),
      ).rejects.toThrow();
    });
  });
});
