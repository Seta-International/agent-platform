import { RequestContext } from '@mastra/core/request-context';
import { buildMastra } from '@seta/copilot/runtime';
import { hashRoleSummary, type SessionScope } from '@seta/core';
import { createUser } from '@seta/identity';
import { createTestTenantWithAdmin } from '@seta/identity/testing';
import { addGroupMember, createGroup, createPlan, createTask } from '@seta/planner';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { classifySkillsAgent } from '../../../../src/backend/workflows/new-task-skill-tag/agents/classify-skills.ts';
import { registerNewTaskSkillTagWorkflow } from '../../../../src/backend/workflows/new-task-skill-tag/index.ts';
import { withCopilotTestDb } from '../../../helpers.ts';

const NEW_TASK_WORKFLOW_ID = 'copilot.new-task-skill-tag';

function adminSession(opts: { tenant_id: string; user_id: string; email: string }): SessionScope {
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

async function seedTenantWithCandidate(
  pool: Pool,
  skills: string[],
): Promise<{
  tenant_id: string;
  admin_user_id: string;
  group_id: string;
  task_id: string;
  candidate_user_id: string;
}> {
  const { tenant_id, admin_user_id } = await createTestTenantWithAdmin({ pool });
  const session = adminSession({ tenant_id, user_id: admin_user_id, email: 'admin@demo.local' });

  await pool.query(
    `INSERT INTO planner.assignee_projection
     (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
     VALUES ($1, $2, 'Admin', 'admin@demo.local', ARRAY[]::text[], 'available', 'UTC')
     ON CONFLICT (user_id) DO NOTHING`,
    [admin_user_id, tenant_id],
  );

  const candidate = await createUser(
    {
      tenant_id,
      email: 'candidate@demo.local',
      name: 'Candidate Carla',
      password: 'password123456',
    },
    { type: 'cli', user_id: null },
  );
  await pool.query(
    `INSERT INTO planner.assignee_projection
     (user_id, tenant_id, display_name, email, skills, availability_status, timezone)
     VALUES ($1, $2, 'Candidate Carla', 'candidate@demo.local', $3, 'available', 'UTC')
     ON CONFLICT (user_id) DO UPDATE SET skills = EXCLUDED.skills`,
    [candidate.user_id, tenant_id, skills],
  );

  const group = await createGroup({ tenant_id, name: 'Engineering', session });
  await addGroupMember({ group_id: group.id, user_id: candidate.user_id, session });

  const plan = await createPlan({ group_id: group.id, name: 'Roadmap', session });
  const task = await createTask({
    plan_id: plan.id,
    title: 'Tune Postgres write throughput',
    description: 'Tail latency spikes during peak writes',
    session,
  });

  return {
    tenant_id,
    admin_user_id,
    group_id: group.id,
    task_id: task.id,
    candidate_user_id: candidate.user_id,
  };
}

function buildRequestContext(opts: {
  tenant_id: string;
  user_id: string;
  source_event_id?: string;
}): RequestContext {
  const rc = new RequestContext();
  rc.set('actor', { type: 'user', user_id: opts.user_id });
  rc.set('tenantId', opts.tenant_id);
  rc.set('startedBy', opts.user_id);
  rc.set('startedVia', 'event');
  if (opts.source_event_id) rc.set('sourceEventId', opts.source_event_id);
  return rc;
}

async function waitForLifecycleFlush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
}

describe('copilot.new-task-skill-tag workflow', () => {
  it('runs through to await-approval and suspends', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      vi.spyOn(classifySkillsAgent, 'generate').mockResolvedValue({
        object: { requiredSkills: ['postgres', 'sse', 'typescript'] },
        error: undefined,
      } as unknown as Awaited<ReturnType<typeof classifySkillsAgent.generate>>);

      const seeded = await seedTenantWithCandidate(pool, ['postgres', 'sse']);
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();
      registerNewTaskSkillTagWorkflow(mastra);
      await mastra.startWorkers();

      const wf = mastra.getWorkflow(NEW_TASK_WORKFLOW_ID);
      const run = await wf.createRun();
      const result = await run.start({
        inputData: {
          taskRef: {
            taskId: seeded.task_id,
            tenantId: seeded.tenant_id,
            groupId: seeded.group_id,
          },
          initiatedBy: { userId: seeded.admin_user_id, via: 'event' },
        },
        requestContext: buildRequestContext({
          tenant_id: seeded.tenant_id,
          user_id: seeded.admin_user_id,
        }),
      });

      expect(result.status).toBe('suspended');

      await waitForLifecycleFlush();
      const runRow = await pool.query(
        `SELECT status, suspend_reason FROM copilot.workflow_runs WHERE run_id = $1`,
        [run.runId],
      );
      expect(runRow.rows[0]?.status).toBe('paused');

      const approval = await pool.query(
        `SELECT step_id, approver_user_id FROM copilot.workflow_approvals WHERE run_id = $1`,
        [run.runId],
      );
      expect(approval.rowCount).toBe(1);
      expect(approval.rows[0]?.step_id).toBe('await-approval');
      expect(approval.rows[0]?.approver_user_id).toBe(seeded.admin_user_id);
    });
  });

  it('on resume with approve, calls planner.assignTask and completes successfully', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      vi.spyOn(classifySkillsAgent, 'generate').mockResolvedValue({
        object: { requiredSkills: ['postgres'] },
        error: undefined,
      } as unknown as Awaited<ReturnType<typeof classifySkillsAgent.generate>>);

      const seeded = await seedTenantWithCandidate(pool, ['postgres']);
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();
      registerNewTaskSkillTagWorkflow(mastra);
      await mastra.startWorkers();

      const wf = mastra.getWorkflow(NEW_TASK_WORKFLOW_ID);
      const run = await wf.createRun();
      await run.start({
        inputData: {
          taskRef: {
            taskId: seeded.task_id,
            tenantId: seeded.tenant_id,
            groupId: seeded.group_id,
          },
          initiatedBy: { userId: seeded.admin_user_id, via: 'event' },
        },
        requestContext: buildRequestContext({
          tenant_id: seeded.tenant_id,
          user_id: seeded.admin_user_id,
        }),
      });

      const result = await run.resume({
        step: 'await-approval',
        resumeData: { decision: 'approve' },
        requestContext: buildRequestContext({
          tenant_id: seeded.tenant_id,
          user_id: seeded.admin_user_id,
        }),
      });

      expect(result.status).toBe('success');

      await waitForLifecycleFlush();
      const runRow = await pool.query(
        `SELECT status FROM copilot.workflow_runs WHERE run_id = $1`,
        [run.runId],
      );
      expect(runRow.rows[0]?.status).toBe('success');

      const assignment = await pool.query(
        `SELECT user_id FROM planner.task_assignments WHERE task_id = $1`,
        [seeded.task_id],
      );
      expect(assignment.rowCount).toBe(1);
      expect(assignment.rows[0]?.user_id).toBe(seeded.candidate_user_id);
    });
  });

  it('on resume with reject, does not assign and ends with decision=reject', async () => {
    await withCopilotTestDb(async ({ pool, databaseUrl }) => {
      vi.spyOn(classifySkillsAgent, 'generate').mockResolvedValue({
        object: { requiredSkills: ['postgres'] },
        error: undefined,
      } as unknown as Awaited<ReturnType<typeof classifySkillsAgent.generate>>);

      const seeded = await seedTenantWithCandidate(pool, ['postgres']);
      const mastra = buildMastra({ pool, databaseUrl });
      await mastra.getStorage()!.init();
      registerNewTaskSkillTagWorkflow(mastra);
      await mastra.startWorkers();

      const wf = mastra.getWorkflow(NEW_TASK_WORKFLOW_ID);
      const run = await wf.createRun();
      await run.start({
        inputData: {
          taskRef: {
            taskId: seeded.task_id,
            tenantId: seeded.tenant_id,
            groupId: seeded.group_id,
          },
          initiatedBy: { userId: seeded.admin_user_id, via: 'event' },
        },
        requestContext: buildRequestContext({
          tenant_id: seeded.tenant_id,
          user_id: seeded.admin_user_id,
        }),
      });

      const result = await run.resume({
        step: 'await-approval',
        resumeData: { decision: 'reject', note: 'wrong fit' },
        requestContext: buildRequestContext({
          tenant_id: seeded.tenant_id,
          user_id: seeded.admin_user_id,
        }),
      });

      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect((result.result as { decision: string }).decision).toBe('reject');
        expect((result.result as { assignment: unknown }).assignment).toBeNull();
      }

      const assignment = await pool.query(
        `SELECT user_id FROM planner.task_assignments WHERE task_id = $1`,
        [seeded.task_id],
      );
      expect(assignment.rowCount).toBe(0);
    });
  });
});
